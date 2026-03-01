import { Bone, Object3D } from "three";
import { cleanBoneName } from "./cleanBoneName";

export function getBoneByName(rig:Object3D, name:string) {
	let bone:Bone|undefined;
	name = cleanBoneName(name); 
	
	rig.traverse( (o:Object3D) => {
		if( o.name.indexOf(name)===0 && o instanceof Bone ) bone = o as Bone;
	})

	if( !bone ) console.log("Bone not found: ", name, rig.name)

	return bone;
}