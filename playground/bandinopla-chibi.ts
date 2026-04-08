/**
 * ---
 * This example app showcases the loading and use of prerecorded data generated via meshcap + posecap.
 * The head was recorded in meshcap and the skeletal animation in posecap ( en exported as glb to then be combined with the main gugu blend scene )
 * ---
 */

import { Color, DirectionalLight } from "three"
import { StandaloneDemoHandler } from "./demo-type"
import { AnimationMixer, AudioLoader, Bone, DoubleSide, InstancedMesh, LinearFilter, Matrix4, Mesh, MeshBasicNodeMaterial, MeshPhysicalMaterial, MeshPhysicalNodeMaterial, NoToneMapping, Object3D, PerspectiveCamera, PMREMGenerator, PointLight, Quaternion, RenderPipeline, Scene, SRGBColorSpace, Texture, UniformNode, UnsignedByteType, Vector3, WebGPURenderer } from "three/webgpu";
import { DRACOLoader, GLTFLoader, RoomEnvironment } from "three/examples/jsm/Addons.js";
import { loadMeshcapAtlas, loadMeshCapFile } from "three-mediapipe-rig/meshcap";
import { colorToDirection, diffuseColor, directionToColor, float, mat3, mix, mrt, mx_noise_float, normalView, output, pass, positionLocal, sample, saturation, texture, time, uniform, uv, vec2, vec3, vec4, velocity } from "three/tsl";
import { dof } from "three/examples/jsm/tsl/display/DepthOfFieldNode.js";
import { chromaticAberration } from "three/examples/jsm/tsl/display/ChromaticAberrationNode.js";
import { vignette } from "three/examples/jsm/tsl/display/CRT.js";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { plotFunction, spinner } from "./spinner";

const assetsUrl = import.meta.env.BASE_URL +"bandinopla-chibi/";

export const bandinoplaChibiExample: StandaloneDemoHandler = {
	name: "bandinopla-chibi", 
	setup: (renderer, camera, scene, tracker) => {

		// link to posecap

		const posecapLink = document.createElement("a");
		posecapLink.href = "https://bandinopla.github.io/three-mediapipe-rig/?editor=posecap";
		posecapLink.target = "_blank";
		posecapLink.innerHTML = "Open PoseCap &#8594;";
		posecapLink.style.position = "absolute";
		posecapLink.style.top = "0";
		posecapLink.style.left = "50%";
		posecapLink.style.transform = "translate(-50%, 0)";
		posecapLink.style.zIndex = "1000";
		posecapLink.style.color = "#ffffff";
		posecapLink.style.backgroundColor = "#cf1f00ff";
		posecapLink.style.padding = "0.5rem";
		posecapLink.style.borderBottomLeftRadius = "0.5rem";
		posecapLink.style.borderBottomRightRadius = "0.5rem";
		posecapLink.style.textDecoration = "none";
		posecapLink.style.fontSize = "1.3rem";
		posecapLink.style.cursor = "pointer"; 
		posecapLink.style.animation = "pulse 2s infinite"; 
		posecapLink.style.boxShadow = "0 0 10px #000000ff";
		document.body.appendChild(posecapLink);


		// credits 
		document.querySelector("#credits > div:last-child")!.innerHTML = `
			Face by <a target="_blank" href="https://x.com/bandinopla">bandinopla</a>
			<br/>
			GuguGaga costume by <a target="_blank" href="https://sketchfab.com/3d-models/cute-gugugaga-741280967ece40e395a70070d8b31132">ReedMan</a>
			<br/>
			Fruit Box by <a target="_blank" href="https://sketchfab.com/3d-models/fruit-box-orange-f92aba34af9f4cd7b3d19cabd44b19a4">Gustavo Pereira</a>
			<br/>
			Grass by <a target="_blank" href="https://sketchfab.com/3d-models/grass-variations-c84573687bf14f89938002df4ca0e696">RBG_illustrations</a>
			<br/>
			Blackboard by <a target="_blank" href="https://aistudio.google.com/">Nano Banana 2</a>
			<br/>
			Sky by <a target="_blank" href="https://www.freepik.com/">Freepik: Pikaso</a>
			<br/>
			Ending Song by <a target="_blank" href="https://x.com/VideoGameIX/status/2032834139460874323">Toaka</a>
			`; 

 
		let loaded = false;
		let subtitles = new Subtitles();
		let updater:((delta:number)=>void)|undefined; 
		const cameraPosition = camera.position.clone();
		let sun!:DirectionalLight;


		scene.background = new Color("#000000");

		scene.traverse((child)=>{
			if(child instanceof DirectionalLight){
				sun = child;
			}
		}); 
		 
		// spinner 

		spinner.position.z=-5
		camera.add(spinner);  
		scene.attach(spinner) 
		spinner.lookAt(0,0,0)

		// sun...
		 
		sun.shadow.mapSize.width = 2048 ;
		sun.shadow.mapSize.height = 2048 ;
		sun.shadow.camera.near = 0.5;
		sun.shadow.camera.far = 30;
		const sunMargin = 5;
		sun.shadow.camera.left = -sunMargin;
		sun.shadow.camera.right = sunMargin;
		sun.shadow.camera.top = sunMargin;
		sun.shadow.camera.bottom = -sunMargin;
		sun.shadow.bias = -0.0003;

		//----- add room enviornment
		const pmremGenerator = new PMREMGenerator(renderer);
		const env = pmremGenerator.fromScene(new RoomEnvironment()).texture;

		scene.environment = env; 
		scene.environmentIntensity = 0.3;
		pmremGenerator.dispose();

		// load assets
		const loader = new GLTFLoader();
		
		const draco = new DRACOLoader();
		draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/'); // path to decoder files
	
		loader.setDRACOLoader(draco);

		const assets = [
			loader.loadAsync(assetsUrl+"gugu.glb"),
			loadMeshCapFile(assetsUrl+"yo.mcap"),
			loadMeshcapAtlas(assetsUrl+"yo-jpg.mcatlas","bandinopla jejeje"),
			new AudioLoader().loadAsync(assetsUrl+"yo2.mp3"),
			new AudioLoader().loadAsync(assetsUrl+"animeending.mp3"),
			new AudioLoader().loadAsync(assetsUrl+"birds.mp3"),
		] as const;

		// all assets ready...

		Promise.all(assets).then(([glb, mcap, faceAtlas, audioBuffer, animeEndingBuffer, birdsBuffer]) => {
            scene.add(glb.scene); 
			spinner.removeFromParent();
			scene.background = new Color("#1b64f2");

			let fadeTarget = 1;
			let bgSoundIsPlaying = false;

			const clickToPlayOverlay = document.createElement("div");
					clickToPlayOverlay.style.position = "absolute";
					clickToPlayOverlay.style.top = "0";
					clickToPlayOverlay.style.left = "0";
					clickToPlayOverlay.style.width = "100%";
					clickToPlayOverlay.style.height = "100%";
					clickToPlayOverlay.style.backgroundColor = "#000000ff";
					clickToPlayOverlay.style.zIndex = "1000";
					clickToPlayOverlay.innerText = "Click to play";
					clickToPlayOverlay.style.color = "#ffffff";
					clickToPlayOverlay.style.textAlign = "center";
					clickToPlayOverlay.style.lineHeight = "100vh";
					clickToPlayOverlay.style.fontSize = "2rem";
					clickToPlayOverlay.style.cursor = "pointer";
					document.body.appendChild(clickToPlayOverlay);

					clickToPlayOverlay.addEventListener("click", () => {
						clickToPlayOverlay.remove();
						play();
					});
 
			 
            let face!: Mesh;
			let bird = glb.scene.getObjectByName("bird") as Mesh;

			setupBird( bird, plotFunction, spinner.config )

            const rig = glb.scene.getObjectByName("rig") as Object3D;
            const hat = glb.scene.getObjectByName("hat") as Mesh;
            const headBone = glb.scene.getObjectByName("head") as Bone;  
            const grass = glb.scene.getObjectByName("grass") as Mesh;
            const ground = glb.scene.getObjectByName("ground") as Mesh;

			setupGrass(grass, ground, scene);

			glb.scene.traverse((child) => {
				if (child instanceof PerspectiveCamera) {
					camera.position.copy(child.position);
					camera.rotation.copy(child.rotation);
					camera.fov = child.fov;
					camera.updateProjectionMatrix();
					cameraPosition.copy(camera.position);
				} else if (child instanceof PointLight) {
					child.intensity = 0;
				} else if (child instanceof Mesh && child.name!=="Plane" && child.name!=="sky" && child.name!=="bird" ) {
					child.castShadow = true;
					child.receiveShadow = true;
					child.material = new MeshPhysicalMaterial({
						map: child.material.map,
						roughness: 1,
						sheen: 0.3,
						sheenColor: 0xffffff,
						sheenRoughness: 0.3,
						side:DoubleSide,
						transparent:child.material.transparent,
						alphaTest:0.5
					});
					if (child.userData.face) {
						face = child as Mesh;
						face.scale.z *= 0.95
					}
				}
				else if( child instanceof Bone )
				{
					console.log("Bone", child.name != child.userData.name?"EPA!!!!!!:"+child.name+"->"+child.userData.name:"OK")
				} 
			});

			headBone.attach(hat);
            headBone.attach(face);

			const mask = (face.material as MeshPhysicalMaterial) .map! as Texture;
			const maskFactor = texture(mask, uv(1)).x.toFloat();
 

			const mixer = new AnimationMixer(rig)
			const action = mixer.clipAction(glb.animations[0])
			
 
			faceAtlas.flipY = false;
			faceAtlas.colorSpace = SRGBColorSpace;
			faceAtlas.generateMipmaps = false;
			faceAtlas.magFilter = LinearFilter;
			faceAtlas.minFilter = LinearFilter;

			const faceCap = mcap.createMaterialHandlerOnMesh(face,faceAtlas, undefined, audioBuffer)

			const faceMat = face.material as MeshPhysicalNodeMaterial;
			faceMat.colorNode = faceCap.material.colorNode!.mul(maskFactor).mul(1.0);
			faceMat.roughness = 0.8;
			faceMat.sheen = 0.1;
			faceMat.sheenColor = new Color(0xffffff);
			faceMat.sheenRoughness = 0.1;
			faceMat.emissiveNode = faceCap.material.colorNode!.mul(maskFactor);
			faceMat.emissiveIntensity = 0.8;

			let t = -1;

			const play = () => {
				theend = false;
				endingThemePlayed = false;
				fadeTarget = 0;
				action.timeScale=0.95
				action.play() 
				faceCap.gotoAndLoop(0) 
				t=0;
				mixer.setTime(t);

				if(!bgSoundIsPlaying){
					bgSoundIsPlaying = true;

					const ctx = new AudioContext();
					const gain = ctx.createGain();
					gain.gain.value = 0.2;
					const source = ctx.createBufferSource();
					source.buffer = birdsBuffer;
					source.loop = true;
					source.connect(gain);
					gain.connect(ctx.destination);
					source.start(0);
					
				}
			}


			const q = new Quaternion()
			const endingTime = 38.39;

			updater = (delta: number) => {

				if( theend ) return;

				if( fadeFactor.value != fadeTarget )
				{
					fadeFactor.value += (fadeTarget - fadeFactor.value) * delta * 5;
					if( Math.abs(fadeFactor.value - fadeTarget) < 0.01 )
					{
						fadeFactor.value = fadeTarget;
					}
				}

				if( t>-1 )
				{
					t += delta;
					subtitles.update(t); 

					
					if( t>=endingTime )
					{
						outro(t-endingTime);
					}
				}

				mixer.update(delta)
				faceCap.update(delta)
 
				const transform = faceCap.getLastKnownFaceTransform();

				if ( transform )
				{
					q.setFromRotationMatrix(transform);
					q.y *= -1;
					q.x *= -1;
					q.z *= -1;
					hat.quaternion.copy(q);
				}
				//headBone.lookAt(camera.position)

				ang+= delta;
				camera.position.copy(cameraPosition).add(new Vector3(Math.cos(ang)*r,Math.cos(ang)*Math.sin(ang)*r,Math.sin(ang)*r))
            
			}

			let endingThemePlayed = false;
			let theend = false;
			let outroSound:AudioNode|undefined;
			let ctx:AudioContext|undefined;
			let endingTheme:AudioBufferSourceNode|undefined;

			function outro( time:number ) {
				if(!ctx)
				{
					ctx = new AudioContext(); 
					const gain = ctx.createGain();
					outroSound = gain;
					gain.gain.value = .1; 
					gain.connect(ctx.destination);
				}

				if(!endingThemePlayed)
				{
					const source = ctx.createBufferSource();
					source.buffer = animeEndingBuffer;
					source.connect(outroSound!);
					source.start(0);
					endingTheme = source;
					endingThemePlayed = true;
				}

				if( time>1 )
				{
					const outFactor = (time-1)/10;
					fadeFactor.value = outFactor;

					if( outFactor>=1 )
					{
						theEnd();
					}
				}
				
			}

			function theEnd() {
				endingTheme?.stop();
				theend = true;
				clickToPlayOverlay.innerText = "Replay"
				document.body.appendChild(clickToPlayOverlay);
			}

			loaded = true;

		});

		const fadeFactor = uniform(1);


		// post processing
		renderer.toneMapping = NoToneMapping; 
		renderer.toneMappingExposure = .5 ;
		renderer.shadowMap.enabled = true;

		const isMobile = navigator.maxTouchPoints > 0;
		const renderPipeline = isMobile ? false : setupPostProcessing(renderer, scene, camera, fadeFactor);

		let ang = 0;
		const r = 0.05

        return (delta) => {
            updater?.(delta);

			if( loaded && renderPipeline ) {
				renderPipeline.render();return true;
			}
        };
	}
}


function setupPostProcessing(
	renderer: WebGPURenderer,
	scene: Scene,
	camera: PerspectiveCamera,
	fadeFactor: UniformNode<"float",number>
) {
	

	const renderPipeline = new RenderPipeline(renderer);

	const scenePass = pass(scene, camera);
	scenePass.setMRT(
		mrt({
			output: output,
			diffuseColor: diffuseColor,
			normal: directionToColor(normalView),
			velocity: velocity,
		}),
	);

	const scenePassColor = scenePass.getTextureNode("output");
	const scenePassDiffuse = scenePass.getTextureNode("diffuseColor");
	const scenePassDepth = scenePass.getTextureNode("depth");
	const scenePassNormal = scenePass.getTextureNode("normal");
	const scenePassVelocity = scenePass.getTextureNode("velocity");
	const scenePassViewZ = scenePass.getViewZNode();

	const diffuseTexture = scenePass.getTexture("diffuseColor");
	diffuseTexture.type = UnsignedByteType;
	const normalTexture = scenePass.getTexture("normal");
	normalTexture.type = UnsignedByteType;

	const sceneNormal = sample((uv) => {
		return colorToDirection(scenePassNormal.sample(uv));
	});

	// const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
	// giPass.sliceCount.value = 2;
	// giPass.stepCount.value = 8;

	// const gi = giPass.rgb;
	// const ao = giPass.a;

	// const compositePass = vec4(
	//     add(scenePassColor.rgb.mul(ao), scenePassDiffuse.rgb.mul(gi)),
	//     scenePassColor.a,
	// );

	// const traaPass = traa(
	//     compositePass,
	//     scenePassDepth,
	//     scenePassVelocity,
	//     camera,
	// );
	// renderPipeline.outputNode = compositePass;

	const effectController = {
					focusDistance: uniform( 8.49 ),
					focalLength: uniform( 5.73 ),
					bokehScale: uniform( 4.24 ),
					vignetteIntensity: uniform( .72 ),
					vignetteSmoothness: uniform( 0.58 ),
				};

	const dofPas = dof(scenePassColor, scenePassViewZ, effectController.focusDistance, effectController.focalLength, effectController.bokehScale);


	const aberr = chromaticAberration(dofPas, vec2(0.1, 0.01), vec2(0.5,0.5))

	const vig = saturation( vignette(aberr, effectController.vignetteIntensity, effectController.vignetteSmoothness), 1.2 )
 
	const withBloom = vig.add( bloom(vig, .2, .8, 1 ) )

	renderPipeline.outputNode = mix( withBloom, vec4(0,0,0,1),fadeFactor ) //film(withBloom, float(0.6));

	renderer.inspector = new Inspector();
	renderer.inspector.init()

	// const gui = renderer.inspector.createParameters( 'Settings' );
	// 			gui.add( effectController.focusDistance, 'value', 0.0, 11.0 ).name( 'focus distance' );
	// 			gui.add( effectController.focalLength, 'value', 0, 11 ).name( 'focal length' );
	// 			gui.add( effectController.bokehScale, 'value', 1, 20 ).name( 'bokeh scale' );
	// 			gui.add( effectController.vignetteIntensity, 'value', 0, 10 ).name( 'vignette intensity' );
	// 			gui.add( effectController.vignetteSmoothness, 'value', 0, 10 ).name( 'vignette smoothness' );

	return renderPipeline;
}

function setupGrass(grassLeaf: Mesh, ground: Mesh, scene: Scene) {
    const vertices = ground.geometry.attributes.position;
    const unique = new Set<string>();

    for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const z = vertices.getZ(i);
        unique.add(`${x},${y},${z}`);
    }

	ground.material = new MeshPhysicalMaterial({
		color: new Color(0x333333)
	})

	grassLeaf.visible = false;
	
	const grassTexture = (grassLeaf.material as MeshPhysicalMaterial).map as Texture
	grassTexture.colorSpace = SRGBColorSpace;
	grassTexture.generateMipmaps = false;
	grassTexture.magFilter = LinearFilter;
	grassTexture.minFilter = LinearFilter;

	const scaleFactor = float(0.5)
	const speed = float(0.5)
	const strength = float(0.1)

	const grassLeafMaterial = new MeshPhysicalNodeMaterial({
		map: grassTexture, 
		roughness:0.5,
		transparent: true,
		side: DoubleSide,
		alphaTest: 0.95, 
		//positionNode: positionLocal.add( vec3( time.sin().mul(0.02),0,0 ).mul(uv().y ) )
		positionNode: positionLocal.add(
				vec3(
					mx_noise_float( positionLocal.xz.mul(scaleFactor).add(time.mul(speed)) ).mul(strength),
					0,
					0
				).mul(uv().y)
			
		)
	})

    const grass = new InstancedMesh(
        grassLeaf.geometry,
        grassLeafMaterial,
        unique.size,
    );

    const dummy = new Object3D();
    const center = new Vector3();

    ground.geometry.computeBoundingBox();
    ground.geometry.boundingBox!.getCenter(center);

    let i = 0;
    for (const key of unique) {
        const [x, y, z] = key.split(",").map(Number);

        const pos = new Vector3(x, y, z);
        const dir = pos.clone().sub(center).normalize();

        dummy.position.copy(pos);
        dummy.lookAt(pos.clone().add(dir));
		dummy.rotateY(Math.PI*2*Math.random())
		dummy.scale.setScalar(0.8)
        dummy.updateMatrix();
        grass.setMatrixAt(i++, dummy.matrix);
    }

    scene.add(grass);

	const scale = 0.8
	grass.scale.setScalar(scale)
	ground.scale.setScalar(scale)

	grass.castShadow = true;
	grass.receiveShadow = true;
}


const audioSubtitles = `0.885 - 1.504 : Hello
1.59 - 2.329 : I'm here to
2.342 - 3.107 : introduce
3.086 - 4.07 : PoseCap
4.925 - 5.454 : with this 
5.484 - 6.072 : editor
6.111 - 6.812 : you'll be able 
6.813 - 7.624 : to record 
8.015 - 9.218 : full pose
9.248-9.970 : animations
10.353 - 10.834 : and
10.835 - 11.337 : then 
11.556 - 12.025 : play it
12.055-12.441 : back
12.691-13.692 : and store it
13.756-14.762 : in a skeleton
15.089-16.094 : so it's very easy
16.253-17.066 : all you have to do 
17.298-18.041 : is to
18.449-19.455 : press record
19.610-20.443 : and start moving
25.858-27.057 : after you're done
27.066-27.805 : the file
27.874-28.413 : will be saved
28.468-29.008 : as a
29.031-29.893 : glb file
31.209-31.965 : that you can
31.982-32.520 : import
32.713-33.276 : into
33.302-34.290 : blender or
34.728-35.390 : into
35.390-36.387 : three.js
37.578-38.261 : hope you like it`.split('\n').map(line => {
	const [timestamp, text] = line.split(":");

	const [start, end] = timestamp.split("-");  

	return {
		start: Number(start.trim()),
		end: Number(end.trim()),
		text: text.trim()
	};
}); 
 
class Subtitles {
	readonly hide:VoidFunction;
	readonly update:( time:number )=>void;
	constructor() {
		const div = document.createElement("div");
		div.style.position = "absolute";
		div.style.bottom = "50px";
		div.style.left = "50%";
		div.style.transform = "translateX(-50%)";
		div.style.color = "white";
		div.style.fontSize = "50px";
		div.style.zIndex = "991000";
		div.style.textAlign = "center";
		div.style.textShadow = "0 0 10px black";
		div.style.fontFamily = "'Arial Black', Gadget, sans-serif";
		div.style.fontWeight = "bold";
		div.style.backgroundColor = "rgba(0,0,0,0.5)";
		div.style.padding = "10px 20px";
		div.style.borderRadius = "10px";
		document.body.appendChild(div);

		this.hide = () => {
			div.style.display = "none";
		}
		this.update = ( time:number ) => {
			div.style.display = "block"; 
			console.log( time )
			const caption = audioSubtitles.find(s => s.start <= time && s.end >= time);
			if (caption) {
				div.textContent = caption.text;
			} else {
				div.textContent = "";
			}
		}

		this.hide();
	}
}

//----------------------
function setupBird( bird:Mesh, posFunc:typeof plotFunction, config:any ){

	const timePassed = time.mul(.1)
	const scaleDetail =  float(.7).add(timePassed.mul(3).sin().mul(0.02));
	const oldPos = posFunc( timePassed.sub(.2).div(4).mod(1), scaleDetail, config );
	const currPos = posFunc( timePassed.div(4).mod(1), scaleDetail, config );

	const dir = currPos.sub(oldPos).normalize().yzx;

	const up = vec3(0,1,0);
	const right = up.cross(dir).normalize();
	const forward = dir;
	const realUp = forward.cross(right).normalize();

	const basis = mat3(right, realUp, forward);

	const mat = new MeshBasicNodeMaterial({
		colorNode: vec3(0) ,
		positionNode: basis.mul(positionLocal.mul(.2)).add(currPos.yzx.mul(7.1)),
		side:DoubleSide,
		transparent:true,
		alphaHash:true,
		opacityNode:texture(bird.material.map!)
		
	})
	bird.material = mat;
}