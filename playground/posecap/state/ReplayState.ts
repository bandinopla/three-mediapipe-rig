import { AnimationAction, AnimationMixer } from "three";
import { BaseState } from "./BaseState";
import { VideoClip } from "../editor-types";
import styles from "../pose-clip-editor.module.css"

export class ReplayState extends BaseState {
	private mixer:AnimationMixer|undefined;
	private clip:VideoClip|undefined;
	private action:AnimationAction|undefined; 
	private t = 0;
	private duration = 0;

	enter() {
		if( this.noRigError() )
		{
			return;
		}

		this.clip = this.ctx.player.selectedItem;

		if( !this.clip )
		{
			alert("No clip selected");
			this.gotoIdleState();
			return;
		} 

		console.log("CLIP SELECTED", this.clip)

		if(!this.mixer || this.mixer.getRoot() !== this.ctx.getActiveRig() )
		{
			this.mixer = new AnimationMixer( this.ctx.getActiveRig()! );
		} 

		this.action = this.mixer.clipAction(this.clip.clip);
		this.action.play();

		this.ctx.tracker.pause();
		this.ctx.tracker.domElement!.classList.add( styles.hide );
		this.ctx.clipper.show();

		this.duration = this.clip.clip.duration;

		this.ctx.clipper.onChange = (start, end) => {
			let endChanged = this.clip!.crop?.end !== end;
			this.clip!.crop = { start, end };
			this.t = endChanged ? end-.1 : start;
		}

		this.ctx.clipper.setRange(this.clip!.crop?.start ?? 0, this.clip!.crop?.end ?? this.duration, this.duration);

	}

	play(shouldPlay: boolean): void {
		if(!shouldPlay)
		{
			this.gotoIdleState();
		}
	}

	update(delta:number):void { 

		this.t += delta;

		if( (this.t > this.duration) || (this.clip?.crop?.end && this.t > this.clip.crop.end) )
		{
			this.t = 0;
		}

		if( this.clip?.crop?.start && this.t < this.clip.crop.start )
		{
			this.t = this.clip.crop.start;
		}

		this.mixer?.setTime(this.t); 
		this.ctx.clipper.setTime(this.t);
	}

	exit(): boolean {
		this.ctx.clipper.hide();
		this.ctx.tracker.domElement!.classList.remove( styles.hide );
		this.ctx.tracker.resume();
		this.action?.stop();
		return true;
	}
}