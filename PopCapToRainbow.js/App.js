export default 'App.js';
import Pop from './PopEngineCommon/PopEngine.js'

let TableGui = null;
let Mp4Sections = [];

function PushMp4Atoms(Atoms)
{
	function ToRow(Atom)
	{
		const Row = {};
		Row.Fourcc = Atom.Fourcc;
		Row.FilePosition = Atom.FilePosition;
		Row.HeaderSize = Atom.HeaderSize;
		Row.ContentSize = Atom.ContentSize;
		return Row;
	}

	const Rows = Atoms.map(ToRow);
	Mp4Sections.push(...Rows);
	TableGui.SetValue(Mp4Sections);
}

function PushMp4Samples(Samples)
{
	function ToRow(Sample)
	{
		const Row = {};
		Row.DecodeTimeMs = Sample.DecodeTimeMs;
		Row.PresentationTimeMs = Sample.PresentationTimeMs;
		Row.ContentSize = Sample.DataSize;
		Row.Keyframe = Sample.IsKeyframe ? 'Keyframe' : '';
		Row.FilePosition = Sample.FilePosition || Sample.DataFilePosition || Sample.DataPosition;
		Row.Flags = `0x` + Sample.Flags.toString(16);
		return Row;
	}

	const Rows = Samples.map(ToRow);
	Mp4Sections.push(...Rows);
	TableGui.SetValue(Mp4Sections);
}

function ClearMp4Sections()
{
	Mp4Sections = [];
}


export async function LoadMp4(Filename)
{
	const Mp4 = new Mp4Decoder();
	ClearMp4Sections();
	
	//	async callback for new data
	async function ReadDecodedAtomThread()
	{
		while ( true )
		{
			const Atom = await Mp4.WaitForNextAtom();
			PushMp4Atoms( [Atom] );
			//	detect EOF
		}
	}
	async function ReadDecodedSampleThread()
	{
		while ( true )
		{
			const Samples = await Mp4.WaitForNextSamples();
			PushMp4Samples( Samples );
		}
	}
	const DecodeAtomThreadPromise = ReadDecodedAtomThread();
	const DecodeSampleThreadPromise = ReadDecodedSampleThread();
	
	//	async loading & feeding data
	async function ReadFileThread()
	{
		function OnNewChunk(Contents)
		{
			Mp4.PushData(Contents);
		}
		const ResolveChunks = false;
		const FilePromise = Pop.FileSystem.LoadFileAsArrayBufferStreamAsync(Filename,ResolveChunks,OnNewChunk);
		await FilePromise;
		Mp4.PushEndOfFile();
	}
	const ReadFilePromise = ReadFileThread();
	
	const WaitAllResult = await Promise.all( [DecodeAtomThreadPromise,DecodeSampleThreadPromise,ReadFilePromise] );
	Pop.Debug(`File loaded; ${WaitAllResult}`,WaitAllResult);
}

export function SetTable(Name)
{
	TableGui = new Pop.Gui.Table(null,Name);
	DragAndDropThread(TableGui).catch(Pop.Warning);
}

async function DragAndDropThread(DropTargetElement)
{
	while(DropTargetElement)
	{
		const DroppedFilename = await DropTargetElement.WaitForDragDrop();
		Pop.Debug(`Dropped File; ${DroppedFilename}`);
		await LoadMp4(DroppedFilename);
	}
}