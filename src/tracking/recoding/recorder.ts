import * as THREE from "three";
import { BoneMap, defaultBoneMap } from "../BoneMapping";
import { GLTFExporter } from "three/examples/jsm/Addons.js";
import { blendShapeKeyNames } from "../blendShapeKeyNames";

type BoneRef = {
    ref: THREE.Bone;
    name: string;
	normalizedName: string;
};

type Recorder = {
	start: () => void;
	captureFrame: () => void;
	stop: (name?: string) => {
		clip: THREE.AnimationClip;
		saveToFile: () => void;
	};
	isRecording: () => boolean;
}

/**
 * Records the local rotation of the bones in the rig. The name used will be the normalized bone name.
 * @param rigRoot
 * @param magging
 * @param fps
 * @returns
 */
export function createRigRecorder(
    rigRoot: THREE.Object3D,
    magging: BoneMap,
    fps = 30,
): Recorder {
    const bones: BoneRef[] = [];
    const faceMesh = rigRoot.getObjectByName(
        magging.faceMesh,
    ) as THREE.SkinnedMesh;
    const usedBlendShapeKeys = new Set<string>();

    //
    // collect used blend shape keys...
    //
    if (faceMesh?.morphTargetDictionary) {
        for (const key in faceMesh.morphTargetDictionary) {
            if (blendShapeKeyNames.includes(key)) {
                usedBlendShapeKeys.add(key);
            }
        }
    }


	//
	// look for the bones
	//
	const boneKeys = Object.keys(magging);
	rigRoot.traverse( o => {
		if(o instanceof THREE.Bone)
		{
			// check if the bone name is in the mapping
			const key = boneKeys.find(k => o.name.indexOf( magging[k as keyof typeof magging] )=== 0 );
			if(key)
			{
				bones.push({
					ref: o,
					name: o.name, 
					normalizedName: key,
				}); 
			}
		}
	});
 

	const times :number[] = [];
    const boneTracks = new Map<
        string,
        number[] //vec4 array
    >();

	const blendShapeTracks = new Map<
		string,
		number[]
	>();

    let recording = false;
    let startTime = 0;

    function start() {
        boneTracks.clear();
		blendShapeTracks.clear();
		times.length = 0;
        startTime = performance.now() / 1000;
        recording = true;
    }

    function captureFrame() {
        if (!recording) return;

        const time = performance.now() / 1000 - startTime;

		times.push(time);

        for (const bone of bones) {
            if (!boneTracks.has(bone.name)) {
                boneTracks.set(bone.name, []);
            }

            const track = boneTracks.get(bone.name)!;  
			 
            const q = bone.ref.quaternion;
            track.push(q.x, q.y, q.z, q.w);
        } 

		for (const key of usedBlendShapeKeys) {
			if (!blendShapeTracks.has(key)) {
				blendShapeTracks.set(key, []);
			}

			const track = blendShapeTracks.get(key)!; 

			const keyIndex = faceMesh.morphTargetDictionary![key];
			const v = faceMesh.morphTargetInfluences![keyIndex];
			track.push(v);
		}
    }

	/** 
	 * @param name name of the resulting clip
	 * @returns 
	 */
    function stop(name = "RecordedClip") {
        recording = false;

        const keyframeTracks: THREE.KeyframeTrack[] = [];

		
 
        for (const [boneName, data] of boneTracks) {
            keyframeTracks.push(
                new THREE.QuaternionKeyframeTrack(
                    `${boneName}.quaternion`,
                    times,
                    data,
                ),
            );
        } 

		for (const [key, data] of blendShapeTracks) {
			keyframeTracks.push(
				new THREE.NumberKeyframeTrack(
					`${defaultBoneMap.faceMesh}.morphTargetInfluences[${key}]`,
					times,
					data,
				),
			);
		}

        const clip = new THREE.AnimationClip(name, -1, keyframeTracks);
 

        return {
			clip,
			saveToFile:() => {
	            const exporter = new GLTFExporter();
	            exporter.parse(
	                rigRoot,
	                (gltf) => {
	                    // binary .glb
	                    const blob = new Blob([gltf as ArrayBuffer], {
	                        type: "model/gltf-binary",
	                    });
	                    const url = URL.createObjectURL(blob);

	                    const a = document.createElement("a");
	                    a.href = url;
	                    a.download = name + ".glb";
	                    a.click();
	                },
	                (error) => {
	                    console.error(error);
	                },
	                {
	                    binary: true,
	                    animations: [clip],
	                },
	            );
	        }
		};
    }

    return { start, captureFrame, stop, isRecording: () => recording };
}
