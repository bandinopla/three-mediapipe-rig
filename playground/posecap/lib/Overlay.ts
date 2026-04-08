import styles from "../pose-clip-editor.module.css"
export class Overlay {
	readonly show:( text?:string )=>void;
	readonly hide:()=>void;
	readonly setStatus:( text:string )=>void;
	constructor() {
		const div = document.createElement("div");
		div.className = styles.overlay;
		document.body.appendChild(div);

		this.show = ( text?:string )=>{
			div.style.display = "block"
			if( text ) this.setStatus(text);
		};
		this.hide = ()=>div.style.display = "none";
		this.setStatus = (text)=>div.innerHTML = text;
		this.hide()
	}
}