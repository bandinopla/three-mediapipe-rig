import { EditorContext, EditorState, IState, VideoClip } from "../editor-types";

export class BaseState implements IState {

	constructor( protected ctx:EditorContext ) {}
	
	exit(): boolean {
		return true;
	}
	enter(): void {
		
	}

	play(shouldPlay:boolean):void {
		
	}

	record(shouldRecord:boolean):void {
		
	}

	selectClip(clip:VideoClip):void {
		
	}
	
	pickFile():void {
		
	}

	protected gotoIdleState() {
		this.ctx.enterState(EditorState.Idle);
	}

	update(delta:number):void {
		this.ctx.bind?.update(delta);
	}

	protected noRigError() {
		if( !this.ctx.bind )
		{
			alert("Upload a rig first...");
			this.gotoIdleState();
			return true;
		}
		return false;
	}

	deleteClip(clip:VideoClip):void {
		if( confirm(`Are you sure you want to delete the currently selected animation?`)) { 
			this.gotoIdleState();
			this.ctx.player?.removeItem(clip.id); 
		}
	}

	download():void {
		this.ctx.enterState(EditorState.Download);
	}

	renameClip(clip:VideoClip):void {
		const name = prompt("Enter new name:", clip.name);
		if( name ) { 

			const clips = this.ctx.player!.items;

			// sligify name and make sure there are no other with the same name
			let newName = name.replace(/[^a-zA-Z0-9]/g, "_");
			let i = 1;
			while( clips.some(c => c.name === newName && c.id !== clip.id) ) {
				newName = `${name}_${i}`;
				i++;
			}	

			this.ctx.player?.renameItem(clip.id, newName);
		}
	}
}