import { AudioLoader, Box3, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture, TextureLoader } from "three";
import { StandaloneDemoHandler } from "./demo-type";
import { loadMeshCapFile, MCapFile, MeshCapMaterialHandler } from "three-mediapipe-rig/meshcap";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { BoxGeometry, Color, DoubleSide, LoadingManager, MathUtils, MeshPhysicalNodeMaterial, Node, NodeMaterial, Object3D, Raycaster, UniformNode, Vector2 } from "three/webgpu";
import { float, Fn, frontFacing, mix, smoothstep, texture, time, uniform, uv, vec3, vec4 } from "three/tsl";
import { Easing, Tween, Group } from "three/examples/jsm/libs/tween.module.js";
import styles from "./game-youtubers.module.css"; 

/**
 * Memory game, were you click on a card and have to find the matching pair...
 * This was done to showcase the use of .mcap files that also use sound clips loaded from a sound atlas!
 */

type Youtuber = {
	id:string 
	displayName:string 
	link:string
	mcap:MCapFile
	atlasTexture:Texture
	atlasAudio:AudioBuffer  
} 

interface IUpdatable {
	update(delta:number):void
}

const rootDir = import.meta.env.BASE_URL + "meshcap-test-files";
 
const youtubersIDs:Partial<Youtuber>[] = [
	{
		id:"carajo",
		displayName:"juanitosay",
		link:"https://www.youtube.com/@juanitosay"
	},
	{
		id:"misterio",
		displayName:"VMGranmisterio",
		link:"https://www.youtube.com/@VMGranmisterio"
	}, 
	{
		id:"chingu",
		displayName:"ChinguAmiga",
		link:"https://www.youtube.com/@ChinguAmiga"
	}, 
	{
		id:"maquicienta",
		displayName:"Maquicienta",
		link:"https://www.youtube.com/@Maquicienta"
	},
	{
		id:"ter",
		displayName:"Ter",
		link:"https://www.youtube.com/@Ter"
	},
	{
		id:"diva",
		displayName:"Diva Misteria",
		link:"https://www.youtube.com/@DivaMisteria"
	},
	{
		id:"kira",
		displayName:"Kira Sensei",
		link:"https://www.youtube.com/@KiraSensei1"
	},
	{
		id:"frausto",
		displayName:"Frausto",
		link:"https://www.youtube.com/@fraustofilms"
	}
]
 
const ldr = new LoadingManager();

async function loadYoutubersData() {

	const ids = youtubersIDs.map( async data => { 
		const [mcap, atlasTexture, atlasAudio] = await Promise.all([
			loadMeshCapFile(`${rootDir}/${data.id}.mcap`),
			new TextureLoader(ldr).loadAsync(`${rootDir}/${data.id}.jpg`),
			new AudioLoader(ldr).loadAsync(`${rootDir}/mp3/${data.id}.mp3`)
		]) 

		data.mcap = mcap;
		data.atlasTexture = atlasTexture;
		data.atlasAudio = atlasAudio;

		return data as Required<Youtuber>;
	})
	
	return Promise.all(ids)
} 

const lineMask = Fn(({ at, thickness }: { at: Node<"float">, thickness: Node<"float"> }) => {
    const half = thickness.div(4);
    
    const fadeIn  = smoothstep(at.sub(half), at.add(half), uv().y);        // 0→1 around `at`
    const fadeOut = smoothstep(at.add(half), at.sub(half), uv().y);  // 1→0 around `at` (inverted edges)

    return fadeIn.mul(fadeOut).mul(3);
});

export const gameYoutubers: StandaloneDemoHandler = {
	name: "game-youtubers", 
	setup: (renderer, camera, scene) => {

		 document.querySelector("#credits > div:last-child")!.innerHTML = `
	Demo showcasing clips with audio from <a href="https://bandinopla.github.io/three-mediapipe-rig/?editor=meshcap" target="_blank">MeshCap</a> `; 

		camera.position.set(0,0,60);
		camera.lookAt(0,0,0); 
		camera.fov = 25;
		camera.far=10000
		camera.updateProjectionMatrix();

		//scene.fog = new Fog(0x000000, 33, 155);
		scene.background = new Color(0);

		let updatables:IUpdatable[] = [];
		let removeUpdatables:IUpdatable[] = [];
		let selectedYoutuber:YoutuberHandler|null = null;
		let pairYoutuber:YoutuberHandler|null = null;
		let cards:YoutuberHandler[] = [];
		//let timeSincePairPick = 0;
		const pairStateDuration = .8;
		const badStateDuration = .3;
		const goodStateDuration = .5;
		let solvedCount = 0;
		let playingIntro = false;

		const youtuberDisplay = new YoutuberDisplayUI()

		updatables.push(youtuberDisplay);

		const loadingScreen = document.createElement("div");
		loadingScreen.classList.add(styles.loadingScreen);
		loadingScreen.innerHTML = "Loading...";
		document.body.appendChild(loadingScreen); 
		
		ldr.onProgress = (url, loaded, total)=>{
			loadingScreen.innerHTML = `Loading... ${loaded}/${total}`;
		} 

		// load the data

		Promise.all([
			loadYoutubersData(),
			new GLTFLoader(ldr).loadAsync(import.meta.env.BASE_URL + "mediapipe-canonical-face.glb"),
			new TextureLoader(ldr).loadAsync(import.meta.env.BASE_URL + "card.png")
		]).then(([youtubers, gltf, cardTexture]) => {

			loadingScreen.remove();

			const faceTmpl = gltf.scene.children[0] as Mesh;
			const bbox = new Box3().setFromObject(faceTmpl); 

			cardTexture.flipY = false;
			cardTexture.colorSpace = SRGBColorSpace;
			cardTexture.generateMipmaps = false;
			

			const cardCardMaterial = new MeshPhysicalNodeMaterial({
				colorNode: mix( texture(cardTexture), vec4(0,0,0,1), frontFacing.toFloat() ),
				roughness:0.3,
				transparent:true, 
				side:DoubleSide,  
				opacityNode: texture(cardTexture).w,
				metalnessMap: cardTexture ,
				
			});

			faceTmpl.removeFromParent(); 

			// for each youtuber...

			youtubers.forEach((youtuber, i) => { 
				 
				youtuber.atlasTexture.flipY = false;
				youtuber.atlasTexture.colorSpace = SRGBColorSpace;
				youtuber.atlasTexture.generateMipmaps = false;
				//youtuber.atlasTexture.minFilter = NearestFilter;
				//youtuber.atlasTexture.magFilter = NearestFilter; 

				const createCard = ()=>{ 
					const mesh = faceTmpl.clone();

					const youtuberMaterial = new MeshPhysicalNodeMaterial()
					const handler = youtuber.mcap.createMaterialHandlerOnMesh(mesh, youtuber.atlasTexture, youtuberMaterial, youtuber.atlasAudio)
	 
					mesh.material = youtuberMaterial

					const card = new YoutuberHandler(youtuber, handler, youtuberMaterial, cardCardMaterial)

					scene.add(card);
					//bbox.getSize( card.scale );
					card.scale.multiplyScalar(2)
					mesh.scale.multiplyScalar(2.2)
 
					card.root.attach(mesh);  
	 
					updatables.push(card);

					card.rotateY(Math.PI) 
  
					cards.push(card)
					return card;
				}

				createCard() 
				createCard() 
			}) ;

			// align
			const cols = Math.round(Math.sqrt(cards.length));
			const rows = Math.ceil(cards.length / cols);

			const cardWidth = 1;
			const cardHeight = 1.5;  // typical card aspect ratio
			const gapX = 5;
			const gapY = 5;
			const totalWidth = cols * (cardWidth + gapX) - gapX;
			const totalHeight = rows * (cardHeight + gapY) - gapY; 


			// handle clicking the cards

			const raycaster = new Raycaster();
			raycaster.layers.set(1);
			// register raycast click on layer 1 only 
			const mouseNDC = new Vector2();

			window.addEventListener("pointerdown", (e) => {
			 
				if( playingIntro ) return;
 

				mouseNDC.x = ( e.clientX / window.innerWidth ) * 2 - 1;
				mouseNDC.y = -(( e.clientY / window.innerHeight ) * 2 - 1);
				raycaster.setFromCamera(mouseNDC, camera);
				const intersects = raycaster.intersectObject(scene, true);
				if( intersects.length ) {
					const hit = intersects[0];
					if( hit.object.userData.youtuberHandler instanceof YoutuberHandler ) {
						const youtuber = hit.object.userData.youtuberHandler as YoutuberHandler;
						
						onYoutuberCardClicked( youtuber )

					}
				}
			})

			const onWindowResize = () => {   
				const aspect = renderer.domElement.width / renderer.domElement.height;
					  const fovRad = MathUtils.degToRad(camera.fov);
					  const halfFov = Math.tan(fovRad / 2);

					  // Distance needed to fit height
					  const distForHeight = totalHeight*1.8 / (2 * halfFov);

					  // Distance needed to fit width (accounts for narrow aspect ratios)
					  const distForWidth = totalWidth*1.8 / (2 * halfFov * aspect);

					  // Use whichever is larger — ensures the entire grid is always visible
					  camera.position.z = Math.max(distForHeight, distForWidth);
					  camera.updateProjectionMatrix();	 
			}
			window.addEventListener("resize", onWindowResize )


			const onYoutuberCardClicked = ( youtuber:YoutuberHandler ) => {
				 
				let playClip = true;

				youtuberDisplay.show(youtuber.youtuber);
				 
				if( youtuber.solved ) return;

				if( selectedYoutuber==null )
				{
					if( youtuber==selectedYoutuber ) return;

					selectedYoutuber = youtuber;  
				}
				else if( pairYoutuber )
				{
					// nothing allowed yet...
					return;
				}
				else
				{
					if( youtuber==selectedYoutuber ) return;
					if( youtuber==pairYoutuber ) return;
					
					
					pairYoutuber = youtuber;  

					playClip = youtuber.youtuber.id != selectedYoutuber.youtuber.id;

					if( playClip )
						selectedYoutuber.stop();
					setTimeout( calculatePairResult, pairStateDuration*1000 );
				}
				
				youtuber.focus(playClip);
			}

			const calculatePairResult = () => {
				const theyMatch = selectedYoutuber!.youtuber.id == pairYoutuber!.youtuber.id;
				let delay = badStateDuration;

				if( theyMatch )
				{
					//...
					//display bad state
					selectedYoutuber!.goodPick();
					pairYoutuber!.goodPick();

					delay = goodStateDuration;

					if( ++solvedCount == youtubersIDs.length )
					{
						setTimeout( onGameSolved,1000 );
					}
				}
				else 
				{
					//display bad state
					selectedYoutuber!.badPick();
					pairYoutuber!.badPick();

					
				}

				setTimeout( () => {
					selectedYoutuber!.blur();
					pairYoutuber!.blur();
					youtuberDisplay.hide();

					selectedYoutuber = null;
					pairYoutuber = null;
				}, delay*1000 );
			}

			const onGameSolved = () => {

				youtuberDisplay.hide();
				console.log("SOLVED!!!!")
				reset();

			}

			/**
			 * Resets the game and starts the intro
			 */
			const reset = () => {

				solvedCount  =0;
				youtuberDisplay.hide();
				playingIntro = true;

				const intro = new Group(); 
				

				// shuffle cards

				for (let i = cards.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[cards[i], cards[j]] = [cards[j], cards[i]];
				}

				let lastTween :Tween<Object3D>|null = null;

				// put them in a line + tween them from start position (middle) to they positionin the grid

				cards.forEach((card, i) => {
					card.position.set(0,0,-15-i)
					card.rotation.set(0,0,0)
					card.reset()

					// 
					const col = i % cols;
					const row = Math.floor(i / cols);

					const goalX = col * (cardWidth + gapX) - totalWidth / 2 + cardWidth / 2;
					const goalY = -(row * (cardHeight + gapY) - totalHeight / 2 + cardHeight / 2);

					card.rotateX(2)

					const tween = (new Tween(card, intro)).to({ position:{x:goalX, y:goalY, z:0}, rotation:{y:[2,Math.PI],x:0,z: Math.PI}  }, 200)
					.easing(Easing.Bounce.In)  
					 
					// const revealTween = tween.chain( new Tween(card.rotation).to({ y:0,x:0,z:0  }, 300) )
									// .onComplete(() => {
									// 	card.playMuted()
									// }); 
 

					if( lastTween) {
						lastTween.chain(tween)
					}
					else 
					{
						tween.delay(1000).start(); 
					}
					
					lastTween = tween;
					

				}); 

				lastTween!.onComplete(() => {
					console.log("INTRO DONE!!")
					removeUpdatables.push(introUpdates)

					// now make them appear....

					cards.forEach( ( card, i)=>{

						setTimeout(() => {
							card.focus(false)
							card.playMuted()
						}, i*50);

					});

					setTimeout( () => {
						playingIntro = false;

						cards.forEach( ( card, i)=> card.blur() );

					}, cards.length*50 + 1000);

				})

				const introUpdates:IUpdatable = {
					update:(delta:number)=>{
						intro.update();
					}
						
				}
				updatables.push(introUpdates)

				// cards.forEach((card, i) => {
				// 	const col = i % cols;
				// 	const row = Math.floor(i / cols);

				// 	card.position.x = col * (cardWidth + gapX) - totalWidth / 2 + cardWidth / 2;
				// 	card.position.y = -(row * (cardHeight + gapY) - totalHeight / 2 + cardHeight / 2);

				// 	card.reset()
				// });

				onWindowResize()
			}

			reset()
			

		});

		return delta => {
			updatables.forEach(u => u.update(delta));
		 
			
			// remove pending removals 
			if( removeUpdatables.length )
			{
				updatables = updatables.filter(up => !removeUpdatables.includes(up));
				removeUpdatables = [];
			}
			
		}
	}, 
};

/**
 * This handles and represent a youtuber's card
 */
class YoutuberHandler extends Object3D implements IUpdatable {
	private _maskFactor :UniformNode<"float", number>;
	private _maskFactorTween:Tween<{value:number}>;
	readonly tween:Tween<Object3D>;
	readonly badPick:VoidFunction;
	readonly goodPick:VoidFunction;
	private undoBadPick?:VoidFunction
	private undoGoodPick?:VoidFunction
	readonly root:Object3D;
	private swingAngle = 0;
	private index = 0;
	static i = 0;
	public solved = false; 

	constructor(readonly youtuber:Youtuber, readonly handler:MeshCapMaterialHandler, readonly material:NodeMaterial, readonly cardMaterial:NodeMaterial) {
		super(); 
		handler.gotoAndStop(0)
		this.index = YoutuberHandler.i++; 
		this.swingAngle = this.index * 0.9;
 

		this.root = new Object3D();
		this.add(this.root);

		//material.colorNode = mix( material.colorNode as Node<"vec4">, uv(), uv().y.lessThan(0.5).toFloat())
		
		const baseColor = material.colorNode as Node<"vec4">; 
		const badPickFactor = uniform(0);
		const resultFactor = uniform(0);

		const badPickTint = vec3(1,0,0).mul( time.mul(119).sin().add(1).mul(0.5) )
		const goodPickTint = vec3(0,1,0).mul( time.mul(119).sin().add(1).mul(0.5) ).mul(4)

		const line = lineMask({ at: time.mod(1) , thickness:0.2 })
		const resultColor = mix(goodPickTint,badPickTint, badPickFactor)

		material.colorNode =  baseColor .mul( mix(vec3(1,1,1), resultColor, resultFactor)   )
						.add( baseColor.mul(line).mul(1.4) )

		material.transparent = true;

		this._maskFactor = uniform(0);

		const limit = this._maskFactor
		const fade = float(0.05)
		const outer = smoothstep(limit, limit.sub( fade ), uv().y)
		const outer2 = smoothstep(limit.mul(1.2), limit.mul(1.2).sub( 0.4 ), uv().y)

		material.opacityNode = outer.add(outer2).clamp(0,1).sub( line  )
		material.alphaHash = true;

		// hit box

		const hitBox = new Mesh(
			new BoxGeometry(1,1,1),
			new MeshBasicMaterial({
				color: 0xff0000,
				transparent: true,
				opacity: 0.5,
				side: DoubleSide
			})
		)
		hitBox.scale.multiplyScalar(1.9)
		hitBox.layers.set(1);
		hitBox.userData.youtuberHandler = this;
		this.add(hitBox)

		// card bg

		const card = new Mesh(
			new PlaneGeometry(1,1.3),
			cardMaterial
		)  
		card.scale.multiplyScalar(2 )
		card.position.set(0,0,-0.8)
		this.root.add(card)

		this._maskFactorTween = new Tween(this._maskFactor) 

		this.tween = new Tween(this);

		this.badPick = () => {
			resultFactor.value = 1;
			badPickFactor.value = 1;
			this.handler.gotoAndStop(0)
			this.undoBadPick = () => {
				resultFactor.value = 0;
				badPickFactor.value = 0;
			}
		}

		this.goodPick = () => {
			resultFactor.value = 1;
			badPickFactor.value = 0;
			this.handler.gotoAndStop(0)
			this.solved = true;
			this.undoGoodPick = () => {
				resultFactor.value = 0;
				badPickFactor.value = 0;
			}
		}
	}

	update(delta:number) {

		this.swingAngle += delta;
		this.root.rotation.y = Math.sin(this.swingAngle) * 0.156;
		this.root.rotation.x = Math.cos(this.swingAngle) * 0.2;
		this.root.rotation.z = Math.cos(this.swingAngle) * 0.02;


		this.handler.update(delta);
		this._maskFactorTween.update()
		this.tween.update()
	}

	stop() {
		this.handler.gotoAndStop(0)
	}

	blur() { 

		if( this.solved )
		{
			this.visible = false;
			return;
		}

		this.undoBadPick?.();
		this.undoBadPick = undefined;

		this._maskFactorTween.stop().to({value:0}, 300).startFromCurrentValues();

		this.tween.stop().to({ rotation: {y:Math.PI, x:0, z:Math.PI} }, 300).easing(Easing.Elastic.Out).duration(1100).startFromCurrentValues();
		this.handler.gotoAndStop(0)
	}

	focus( playClip=true, tweening=true ) { 

		this.handler.muted = false;
		this._maskFactorTween.stop().to({value:1}, 300).startFromCurrentValues();

		if( tweening ) { 
			
			this.tween.stop().to({ rotation: {y:0, x:0, z:0} }, 500).easing(Easing.Exponential.Out).duration(500).startFromCurrentValues();
		} 
		
		if( playClip )
			this.handler.gotoAndPlay(0, ()=>this.handler.gotoAndStop(0 ));
		else
			this.handler.gotoAndStop(0 );
	}

	playMuted() {
		this._maskFactorTween.stop().to({value:1}, 300).startFromCurrentValues();
		this.handler.muted = true;
		this.handler.gotoAndLoop(0);
	}

	reset() {
		this.visible = true;
		this.solved = false;
		this.undoBadPick?.();
		this.undoBadPick = undefined;
		this.undoGoodPick?.();
		this.undoGoodPick = undefined;
		//this._maskFactorTween.stop().to({value:0}, 300).startFromCurrentValues();
		this.rotation.set(0,Math.PI,Math.PI)
		//this.tween.stop().to({ rotation: {y:Math.PI, x:0, z:Math.PI} }, 300).easing(Easing.Elastic.Out).duration(1100).startFromCurrentValues();
		this.handler.gotoAndStop(0)
	}
}

/**
 * This is the display that appears on top of the frame indicating the youtuber's name and avatar picture.
 */
class YoutuberDisplayUI implements IUpdatable {
	readonly show:(youtuber:Youtuber)=>void;
	readonly hide:()=>void;

	private avatarStore:Map<Youtuber, string> ;
	readonly update:(delta:number)=>void;

	constructor() {

		const div = document.createElement("div");
		div.classList.add(styles.youtuberDisplayUI);
		document.body.appendChild(div);

		const avatar = document.createElement("div");
		avatar.classList.add(styles.youtuberAvatar);
		div.appendChild(avatar);

		const ytIcon = document.createElement("div");
		ytIcon.classList.add(styles.play);
		div.appendChild(ytIcon);
 
		const name = document.createElement("a");
		name.classList.add(styles.youtuberName);
		div.appendChild(name); 

		this.avatarStore = new Map();

		const cssScale = {x:0, y:0};
		const scaleTween = new Tween(cssScale, false)  
				.easing(Easing.Elastic.Out) // Use an easing function to make the animation smooth.
				.onUpdate(() => {
					// Called after tween.js updates 'coords'.
					// Move 'box' to the position described by 'coords' with a CSS translation.
				
					div.style.setProperty('transform', 'translateX(-50%) scale(' + cssScale.x + ',' + cssScale.y + ')')
				})

		this.update = delta => {
			scaleTween.update();
		}

		this.show = (youtuber:Youtuber)=>{
			div.style.display = "flex";
			name.innerHTML = youtuber.displayName;
			name.href = youtuber.link;
			name.target = "_blank";
			//avatar.style.backgroundImage = `url(${youtuber.avatar})`;

			let avatarUrl = this.avatarStore.get(youtuber);
			if( !avatarUrl )
			{
				const offscreen = document.createElement('canvas');
				const frameUV = youtuber.mcap.clips[0].frames[0].frameUV;
				const atlasW = youtuber.atlasTexture.width;
				const atlasH = youtuber.atlasTexture.height;
				offscreen.width = frameUV.w * atlasW;
				offscreen.height = frameUV.h * atlasH;
				offscreen.getContext('2d')!.drawImage(youtuber.atlasTexture.image as HTMLImageElement, frameUV.u*atlasW, frameUV.v*atlasH, frameUV.w*atlasW, frameUV.h*atlasH, 0, 0, offscreen.width, offscreen.height);
				avatarUrl = offscreen.toDataURL();
				this.avatarStore.set(youtuber, avatarUrl);
			}
			avatar.style.backgroundImage = `url(${avatarUrl})`;

			cssScale.x = 0.5;
			cssScale.y = 0.5;
			scaleTween.stop().to({x:1, y:1}, 500).startFromCurrentValues();
		}

		this.hide = () => {
			div.style.display = "none";
			scaleTween.stop().to({x:0, y:0}, 300).startFromCurrentValues();
		}

		this.hide()

	}
}