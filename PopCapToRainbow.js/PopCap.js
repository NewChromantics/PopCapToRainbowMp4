//	gr: I did make an effecient decoder, but its so simple and not important here, Im just gonna write another
import Pop from './PopEngineCommon/PopEngine.js'
import PromiseQueue from './PopEngineCommon/PromiseQueue.js'
import {DataReader,EndOfFileMarker} from './PopEngineCommon/DataReader.js'
import {StringToBytes,BytesToString} from './PopEngineCommon/PopApi.js'

const PacketMarker = StringToBytes('Pop\n');

//	convert to string, but also validate is json
function BytesToJson(Bytes)
{
	const String = BytesToString(Bytes);
	const Json = JSON.parse(String);
	return Json;
}

export default class PopCapDecoder
{
	constructor()
	{
		this.NewFrameQueue = new PromiseQueue('PopCap decoder frame queue');
	
		this.NewByteQueue = new PromiseQueue('PopCap pending bytes');
		this.FileReader = new DataReader( new Uint8Array(0), 0, this.WaitForMoreFileData.bind(this) );
		
		this.ParsePromise = this.ParseFileThread();
	}
	
	async WaitForMoreFileData()
	{
		return this.NewByteQueue.WaitForNext();
	}
	
	async WaitForNextFrame()
	{
		return this.NewFrameQueue.WaitForNext();
	}

	PushEndOfFile()
	{
		this.PushData(EndOfFileMarker);
	}
	
	PushData(Bytes)
	{
		this.NewByteQueue.Push(Bytes);
	}

	OnFrame(Frame)
	{
		//	todo: push into a list for different streams, then output synchronised stream packets
		this.NewFrameQueue.Push(Frame);
	}
	
	async ParseFileThread()
	{
		while ( true )
		{
			await Pop.Yield(0);
			
			const NextMetaPacket = await this.FileReader.ReadUntilMatch(PacketMarker,false);
			//	probably a marker at the start of a file (or Pop\nPop\n somehwere)
			if ( NextMetaPacket.length == 0 )
				continue;

			const Frame = {};
			try
			{
				Frame.Meta = BytesToJson(NextMetaPacket);
			}
			catch(e)
			{
				Pop.Warning(`Next packet didn't turn to meta as expected`);
				continue;
			}
			
			//	bytes next
			try
			{
				Frame.Data = await this.FileReader.ReadUntilMatch(PacketMarker,false);
				this.OnFrame(Frame);
			}
			catch(e)
			{
				if ( e == 'eof' )
					this.OnFrame(e);
				else
					throw e;
			}
		}
	}
}
