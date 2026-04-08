import { AnimationClip, Object3D } from "three"
import { PlayableItem, PlayerUI } from "./lib/PlayerUI"
import { RecordableBindingHandler, TrackerHandler } from "three-mediapipe-rig"
import { ClipRange } from "./lib/ClipRangeUI"
import { Overlay } from "./lib/Overlay"

// Example of extending the generic interface
export interface VideoClip extends PlayableItem {
	clip: AnimationClip
	crop?:{
		start:number
		end:number
	}
}
 
export interface IState {

	/**
	 * if false is returned it means this state can't be exited.
	 */
	exit():boolean
	enter():void
	update?(delta:number):void

	play(shouldPlay:boolean):void
	record(shouldRecord:boolean):void
	selectClip(clip:VideoClip):void
	pickFile():void
	deleteClip?(clip:VideoClip):void
	download?():void
	renameClip?(clip:VideoClip):void
}

export type EditorContext = {
	enterState(state:EditorState):void
	tracker:TrackerHandler
	bind?:RecordableBindingHandler
	player:PlayerUI<VideoClip>
	setActiveRig(rig:Object3D):void
	getActiveRig():Object3D|undefined
	clipper:ClipRange
	FPS:number

	/**
	 * Delay before recording ( to give time to the user to get into the pose... )
	 */
	countdown:number

	/**
	 * Overlay UI used to show text to the user but blocking everything so nothing can be clicked
	 */
	overlay:Overlay
}

export enum EditorState {
	Idle,
	Recording,
	Replay, 
	PickFile,
	Download
}