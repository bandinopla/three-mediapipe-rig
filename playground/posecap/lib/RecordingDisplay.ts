import styles from "./RecordingDisplay.module.css"

export class RecordingDisplay {
	public show:( legend?:string )=>void;
	public hide:VoidFunction;
	public update:(time:number)=>void;
	
	constructor() {

		const div = document.createElement("div"); 
		div.classList.add(styles.root); 

		const timer = document.createElement("div");
		timer.classList.add(styles.timer); 
		div.appendChild(timer);

		const legend = document.createElement("div");
		legend.classList.add(styles.legend);
		legend.innerHTML = "Recording...";
		div.appendChild(legend);

		this.show = (text?:string)=>{
			if(text) legend.innerHTML = text;
			document.body.appendChild(div);
		}
		this.hide = ()=>{
			div.remove()
		}
		this.update = (time:number)=>{
			const s = Math.floor(time);
			const m = Math.floor(s/60);
			const ss = s%60;
			const ms = Math.floor((time-s)*100);
			timer.innerHTML = `${m.toString().padStart(2,"0")}:${ss.toString().padStart(2,"0")}:${ms.toString().padStart(2,"0")}`
		}
	}	
}