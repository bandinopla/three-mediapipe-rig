import { AnimationClip, Mesh, MeshPhysicalMaterial } from "three";
import { BaseState } from "./BaseState";
import { GLTFExporter, SkeletonUtils } from "three/examples/jsm/Addons.js";

export class DownloadState extends BaseState {
    enter() {
        if (this.noRigError()) return;

        const clips = this.ctx.player.items;

        if (clips.length == 0) {
            alert("No clips to download.");
            return this.gotoIdleState();
        }

        const animationClips = clips.map((clip) => {
            if (clip.crop) {
                const c = cropClip(clip.clip, clip.crop.start, clip.crop.end);

                c.name = clip.name;

                return c;
            } else {
                clip.clip.name = clip.name;
                return clip.clip;
            }
        });

        const exporter = new GLTFExporter();

        // clone to avoid mutating original
		const rig = this.ctx.getActiveRig(); 
        const clone = SkeletonUtils.clone(rig!) ; 

        // lets export just the mesh no textures.
		
		const nomaterial = new MeshPhysicalMaterial({color:0xcccccc});
	 
        clone.traverse((obj) => {
            if ( obj instanceof Mesh) {
                obj.material = nomaterial;
            }
        });
 

        exporter.parse(
            clone,

            (result) => {
                const blob = new Blob([result as ArrayBuffer], {
                    type: "model/gltf-binary",
                });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;
                a.download = "animations.glb";
                a.click();

                URL.revokeObjectURL(url);
                this.gotoIdleState();
            },
            (error) => {
                console.error(error);
                alert("Failed to download rig. Error: " + error.toString());
                this.gotoIdleState();
            },
            {
                binary: true,
                animations: animationClips,
            },
        );
    }
}

function cropClip(clip: AnimationClip, start: number, end: number) {
    const duration = end - start;

    const tracks = clip.tracks.map((track) => {
        const times = [];
        const values = [];
        const valueSize = track.getValueSize();

        for (let i = 0; i < track.times.length; i++) {
            const t = track.times[i];
            if (t >= start && t <= end) {
                times.push(t - start);
                for (let j = 0; j < valueSize; j++) {
                    values.push(track.values[i * valueSize + j]);
                }
            }
        }

        return new (track.constructor as any)(track.name, times, values);
    });

    return new AnimationClip(clip.name, duration, tracks);
}
