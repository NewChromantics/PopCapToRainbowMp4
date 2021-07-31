export default 'App.js';
import Pop from './PopEngineCommon/PopEngine.js'
import PopCapDecoder from './PopCap.js'
import {Mp4FragmentedEncoder} from './PopEngineCommon/Mp4.js'
import {Mp4Decoder} from './PopEngineCommon/Mp4.js'


class FileGui
{
	constructor(Name)
	{
		this.Sections = [];
		this.Gui = new Pop.Gui.Table(null,Name);
	}
	
	Clear()
	{
		this.Sections = [];
		this.Gui.SetValue(this.Sections);
	}
	
	PushRows(Rows)
	{
		this.Sections.push(...Rows);
		this.Gui.SetValue(this.Sections);
	}
};


let Mp4TableGui = null;
let PopCapTableGui = null;

export async function LoadMp4(WaitForBytes)
{
	const Mp4 = new Mp4Decoder();
	Mp4TableGui.Clear();
	
	//	async callback for new data
	async function ReadDecodedAtomThread()
	{
		while ( true )
		{
			const Atom = await Mp4.WaitForNextAtom();
			PushMp4Atoms( Mp4TableGui, [Atom] );
			//	detect EOF
		}
	}
	async function ReadDecodedSampleThread()
	{
		while ( true )
		{
			const Samples = await Mp4.WaitForNextSamples();
			PushMp4Samples( Mp4TableGui, Samples );
		}
	}
	const DecodeAtomThreadPromise = ReadDecodedAtomThread();
	const DecodeSampleThreadPromise = ReadDecodedSampleThread();
	
	//	async loading & feeding data
	async function ReadFileThread()
	{
	/*
		function OnNewChunk(Contents)
		{
			Mp4.PushData(Contents);
		}
		const ResolveChunks = false;
		const FilePromise = Pop.FileSystem.LoadFileAsArrayBufferStreamAsync(Filename,ResolveChunks,OnNewChunk);
		await FilePromise;
		Mp4.PushEndOfFile();
		*/
		while(true)
		{
			const Bytes = await WaitForBytes();
			Mp4.PushData(Bytes);
		}
	}
	const ReadFilePromise = ReadFileThread();
}


function PushMp4Atoms(Gui,Atoms)
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
	Gui.PushRows(...Rows);
}

function PushMp4Samples(Gui,Samples)
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
	Gui.PushRows(...Rows);
}

function PushGuiFrames(Gui,Frames)
{
	function ToRow(Frame)
	{
		const Row = {};
		Row.Stream = Frame.Meta.Stream;
		//Row.CameraName = Frame.Meta.CameraName;
		Row.OutputTimeMs = Frame.Meta.OutputTimeMs;
		Row.Keyframe = Frame.Meta.Keyframe;
		Row.WidthHeight = `${Frame.Meta.Width}x${Frame.Meta.Height}`;
		//Row.Meta = Frame.Meta;
		Row.DataSize = Frame.Data.length;
		return Row;
	}

	const Rows = Frames.map(ToRow);
	Gui.PushRows(Rows);
}

const TrackMap = [];	//	streamname -> index = id
let PendingMp4 = null;
let Mp4BaseTimestamp = null;

function GetTrackId(StreamName)
{
	let Index = TrackMap.indexOf(StreamName);
	if ( Index < 0 )
	{
		TrackMap.push(StreamName);
		Index = TrackMap.indexOf(StreamName);
	}
	return Index;
}
/*
async function EncodingMp4Thread(Mp4)
{
	//	async callback for new data
	async function ReadDecodedAtomThread()
	{
		while ( true )
		{
			const Atom = await Mp4.WaitForNextAtom();
			PushMp4GuiAtoms( Mp4TableGui, [Atom] );
			//	detect EOF
		}
	}
	const DecodeAtomThreadPromise = ReadDecodedAtomThread();
}
*/

function PushMp4Frame(Frame)
{
	const DataStream = Frame.Meta.StreamName;
	const DataTrack = GetTrackId(DataStream);
	const MetaStream = Frame.Meta.StreamName + '_Meta';
	const MetaTrack = GetTrackId(MetaStream);
	
	if ( !PendingMp4 )
	{
		PendingMp4 = new Mp4FragmentedEncoder();
		//EncodingMp4Thread(PendingMp4).catch(console.error);
		async function WaitForMp4Bytes()
		{
			return PendingMp4.WaitForNextEncodedBytes();
		}
		LoadMp4(WaitForMp4Bytes);
	}
	
	const MetaData = JSON.stringify(Frame.Meta);
	
	if ( Mp4BaseTimestamp === null )
		Mp4BaseTimestamp = Frame.Meta.OutputTimeMs;
	
	const Time = Frame.Meta.OutputTimeMs - Mp4BaseTimestamp;
	PendingMp4.PushSample( Frame.Data, Time, Time, DataTrack );
	PendingMp4.PushSample( MetaData, Time, Time, MetaTrack );
}

export async function LoadPopCap(Filename)
{
	const Decoder = new PopCapDecoder();
	PopCapTableGui.Clear();
	
	//	async callback for new data
	async function ReadDecodedFrameThread()
	{
		while ( true )
		{
			const Frame = await Decoder.WaitForNextFrame();
			PushGuiFrames( PopCapTableGui, [Frame] );
			PushMp4Frame(Frame);
			//	detect EOF
		}
	}
	const DecodeFrameThreadPromise = ReadDecodedFrameThread();
	
	//	async loading & feeding data
	async function ReadFileThread()
	{
		function OnNewChunk(Contents)
		{
			Decoder.PushData(Contents);
		}
		const ResolveChunks = false;
		const FilePromise = Pop.FileSystem.LoadFileAsArrayBufferStreamAsync(Filename,ResolveChunks,OnNewChunk);
		await FilePromise;
		Decoder.PushEndOfFile();
	}
	const ReadFilePromise = ReadFileThread();
	
	const WaitAllResult = await Promise.all( [DecodeFrameThreadPromise,ReadFilePromise] );
	Pop.Debug(`File loaded; ${WaitAllResult}`,WaitAllResult);
}

export function SetMp4Table(Name)
{
	Mp4TableGui = new FileGui(Name);
	//DragAndDropThread(TableGui).catch(Pop.Warning);
}

export function SetPopCapTable(Name)
{
	PopCapTableGui = new FileGui(Name);
	DragAndDropThread(PopCapTableGui.Gui).catch(Pop.Warning);
}

async function DragAndDropThread(DropTargetElement)
{
	while(DropTargetElement)
	{
		const DroppedFilename = await DropTargetElement.WaitForDragDrop();
		Pop.Debug(`Dropped File; ${DroppedFilename}`);
		await LoadPopCap(DroppedFilename);
	}
}
