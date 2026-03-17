import { Tracker } from "src/tracking/Tracker";
import { TrackerConfig, TrackerHandler } from "three-mediapipe-rig";
import { PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu"; 

export type DemoHandler = {
	name:string,
	trackerConfig:Partial<TrackerConfig>,
	setup: ( renderer:WebGPURenderer, camera:PerspectiveCamera, scene:Scene, tracker:TrackerHandler)=>(delta:number)=>void
};