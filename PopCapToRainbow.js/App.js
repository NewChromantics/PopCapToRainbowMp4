export default 'App.js';
import Pop from './PopEngineCommon/PopEngine.js'
import PopCapDecoder from './PopCap.js'
import {Mp4FragmentedEncoder} from './PopEngineCommon/Mp4.js'

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

function PushMp4Frame(Frame)
{
	const DataStream = Frame.Meta.StreamName;
	const DataTrack = GetTrackId(DataStream);
	const MetaStream = Frame.Meta.StreamName + '_Meta';
	const MetaTrack = GetTrackId(MetaStream);
	
	if ( !PendingMp4 )
		PendingMp4 = new Mp4FragmentedEncoder();
	
	const MetaData = JSON.stringify(Frame.Meta);
	const Time = Frame.Meta.OutputTimeMs;
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
