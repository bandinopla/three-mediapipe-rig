import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";
import { BaseState } from "./BaseState";
import { AnimationClip, Object3D, Skeleton, SkinnedMesh } from "three";
import { getRig } from "../utils/getRig";
import { EditorState } from "../editor-types";
import { clipAffectsRig } from "../utils/clipAffectsRig";

export class PickFileState extends BaseState {
	
	enter(): void {

		this.triggerFilePicker().then( (res) => {
			if( res )
			{
				this.ctx.setActiveRig( res[0] );

				this.ctx.player.setItems(res[1].map(clip => {
					return {
						id: clip.name,
						name: clip.name,
						clip,
						duration: clip.duration, 
					}
				}))
			}
				 
		}, err=>{
			alert(err);
		})
		
		.finally(()=>{
			console.log("Finally")
			this.gotoIdleState()
		});
	}

	/**
	 * user wants to pick a glb file
	 */
	private async triggerFilePicker() {
		// trigger file selector for a glb file
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = '.glb';
		

		return new Promise<readonly [Object3D, AnimationClip[]] | undefined>((resolve, reject) => {

			fileInput.onchange = (e:Event) => {
				const target = e.target as HTMLInputElement;
 
				if(!target.files || target.files.length === 0) return resolve(undefined);
				const file = target.files[0];
				const url = URL.createObjectURL(file);
				
				this.getRigFromGlb(url).then( resolve ).catch( reject );
			}

			fileInput.oncancel = () => {
				resolve(undefined);
			}

			fileInput.click();
		});
	}

	/**
	 * the user picked a glb, we need to scan the file looking for a rig to use...
	 * @param url 
	 * @returns 
	 */
	private async getRigFromGlb(url:string) {
		const loader = new GLTFLoader();

		const draco = new DRACOLoader();
		draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/'); // path to decoder files

		loader.setDRACOLoader(draco);

		const glb = await loader.loadAsync(url);
		
		const skeletons = new Set<Skeleton>();
		const skins = new Map<Skeleton, SkinnedMesh[]>();
		glb.scene.traverse((child) => {
			if (child instanceof SkinnedMesh) {
				skeletons.add(child.skeleton);
				if(!skins.has(child.skeleton)) skins.set(child.skeleton, []);
				skins.get(child.skeleton)!.push(child);
			}
		});

		if( skeletons.size==0 )
		{
			throw new Error("No skeletons/rigs found in the glb file"); 
		}

		let skeleton = skeletons.values().next().value!;

		if( skeletons.size>1 )
		{
			const skeletonsArray = Array.from(skeletons.values());
			const chosenIndex = prompt(`Multiple rigs detected, pick one:\n${
				skeletonsArray.map((s,i)=>`${i}: ${ getRig(s.bones[0])?.name || "unknown" }`).join('\n')}
				`) ?? 0;
			if( chosenIndex ) 
				skeleton = skeletonsArray[parseInt(chosenIndex)];
		}

		const rig = getRig(skeleton.bones[0])!;

		// obtain the relevant animationclips
		const clips = glb.animations.filter(clip => clipAffectsRig(clip, rig));

		return [rig as Object3D, clips] as const;
		
	}
}