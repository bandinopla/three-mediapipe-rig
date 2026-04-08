import { RecordingDisplay } from "../lib/RecordingDisplay";
import { BaseState } from "./BaseState";


export class RecordingState extends BaseState {
	private display!:RecordingDisplay;
	private t = 0;

	private onKeyDown = (e:KeyboardEvent)=>{
		if( e.key === " " || e.key === "Enter" || e.key === "Escape" )
		{
			this.record(false);
		}
	}

	override enter(): void {
		if( this.noRigError() )
		{ 
			return;
		}

		if( !this.display )
		{
			this.display = new RecordingDisplay();
		}

		if( this.ctx.countdown > 0 )
		{
			this.doCountDown().then(()=>{
				this.startRecording();
			})
		}
		else 
		{
			this.startRecording();
		}
		
	}

	private startRecording() {
		this.display.show("Press ESC or SPACE or ENTER to stop...");
		this.ctx.player.hide();

		this.t = 0;
		this.ctx.bind!.startRecording(this.ctx.FPS);

		// if SPACE or ENTER or ESC, stop recording
		window.addEventListener("keydown", this.onKeyDown);
	}

	private async doCountDown() {
		for( let i = this.ctx.countdown; i > 0; i-- )
		{
			this.ctx.overlay.show(`<h1>${i}</h1>`);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
		this.ctx.overlay.hide();
	}

	override exit() {
		this.ctx.player.show();
		this.display?.hide();
		window.removeEventListener("keydown", this.onKeyDown);
		return true;
	}

	override update(delta: number): void {
		this.t += delta;
		this.display.update(this.t);
		super.update(delta);
	}

	override record(shouldRecord: boolean): void {
		if( !shouldRecord )
		{
			const id = this.ctx.player.items.length.toString();
			const result = this.ctx.bind!.stopRecording();

			//console.log("Recording result", result.clip.duration)
			this.ctx.player.addItem({
				clip:result.clip,
				name: "Recording-"+id ,
				id:id, 
			})

			this.ctx.player.selectItem(id);
			this.gotoIdleState();
		}
	}
		
}