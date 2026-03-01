import { Object3D, Quaternion, Vector3 } from "three/webgpu";

const poleDir = new Vector3();
const objectPosition = new Vector3();

const XAxis = new Vector3(1,0,0);
const XAxisNeg = new Vector3(-1,0,0);
const YAxis = new Vector3(0,1,0); 
const YAxisNeg = new Vector3(0,-1,0); 
const ZAxis = new Vector3(0,0,1); 
const ZAxisNeg = new Vector3(0,0,-1); 

const pole = new Vector3();
const lookDir = new Vector3();

const v = new Vector3();
const correction = new Quaternion();
const worldQuat = new Quaternion();

export type LookAtPoleAxis = "+x"|"+y"|"-x"|"-y"

/**
 * Will point the Z axis of object at target and the X or Y axis in the general direction of the pole target
 * @param object The object to rotate
 * @param target The point to look at ( in world coord )
 * @param poleTarget The goal of the pole axis ( in world coord )
 * @param poleAxis The axis to use as the pole axis ( z is the one pointing at the target )
 */
export function lookAt( object:Object3D, target:Vector3, poleTarget:Vector3, poleAxis:LookAtPoleAxis = "+x" )
{ 
	//
	// look at target (handles parent transforms internally)
	// 
	object.lookAt(target);

	const axis = poleAxis=="+x"?XAxis: poleAxis=="-x"?XAxisNeg: poleAxis=="+y"?YAxis: YAxisNeg;

	object.getWorldPosition(objectPosition);
	object.getWorldQuaternion(worldQuat);

	poleDir.subVectors(poleTarget, objectPosition).normalize();

	// direction in which the pole axis is currently pointing (in world space)
	pole.copy(axis).applyQuaternion(worldQuat);

	const currentPole = pole;

	// look direction in world space
	const lookAxisDir = lookDir.copy( ZAxis ).applyQuaternion(worldQuat);

	// project desired pole direction onto the plane perpendicular to the look axis
	const desiredPoleDir = poleDir.clone().addScaledVector(lookAxisDir, -poleDir.dot(lookAxisDir)).normalize();

	// signed angle between current pole and desired pole around the look axis
	const cross = v.crossVectors(currentPole, desiredPoleDir);
	const angle = Math.atan2(cross.dot(lookAxisDir), currentPole.dot(desiredPoleDir));

	// The correction is a spin around the look axis (local Z after lookAt).
	// Since lookAt aligned local Z to the target, we can apply around the local Z axis directly.
	correction.setFromAxisAngle(ZAxis, angle);
	object.quaternion.multiply(correction);
}