export default 'App.js';
import Pop from './PopEngineCommon/PopEngine.js'
import PopCapDecoder from './PopCap.js'

let TableGui = null;
let Sections = [];

function PushFrames(Frames)
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
	Sections.push(...Rows);
	TableGui.SetValue(Sections);
}


function ClearSections()
{
	Sections = [];
}


export async function LoadPopCap(Filename)
{
	const Decoder = new PopCapDecoder();
	ClearSections();
	
	//	async callback for new data
	async function ReadDecodedFrameThread()
	{
		while ( true )
		{
			const Frame = await Decoder.WaitForNextFrame();
			PushFrames( [Frame] );
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
		await LoadPopCap(DroppedFilename);
	}
}
