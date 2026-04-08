import { Bone } from "three";

export function getRig(bone:Bone) {
	let b = bone;
	while (b.parent && b.parent instanceof Bone) {
		b = b.parent;
	}
	return b.parent;
}