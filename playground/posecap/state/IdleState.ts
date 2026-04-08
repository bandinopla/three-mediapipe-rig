import { EditorState } from "../editor-types";
import { BaseState } from "./BaseState";

export class IdleState extends BaseState {

	enter(): void {
		this.ctx.player.setPlayState(false);
		this.ctx.player.setRecordState(false);
		
	}
	
	record(shouldRecord: boolean): void {
		if( shouldRecord )
		{
			this.ctx.enterState(EditorState.Recording);
		}
	}

	pickFile(): void {
		this.ctx.enterState(EditorState.PickFile);
	}

	play(shouldPlay:boolean): void {
		if( shouldPlay )
		{
			this.ctx.enterState(EditorState.Replay);
		}
	}
}