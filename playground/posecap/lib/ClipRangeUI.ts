export class ClipRange {
    root: HTMLDivElement;
    track: HTMLDivElement;
    range: HTMLDivElement;
	playhead: HTMLDivElement;
    handleStart: HTMLDivElement;
    handleEnd: HTMLDivElement;

    duration: number;
    start = 0;
    end: number;

    private dragging: "start" | "end" | null = null;

	onChange?:(start:number, end:number)=>void

    constructor(duration: number) {
        this.duration = duration;
        this.end = duration;

        this.root = document.createElement("div");
        this.root.style.position = "absolute";
        this.root.style.height = "40px";
        this.root.style.left = "50%";
		this.root.style.transform = "translateX(-50%)";
        this.root.style.bottom = "100px";
        this.root.style.width = "50%";
        this.root.style.background = "#222";
        this.root.style.touchAction = "none";
        this.root.style.zIndex = "99999";

        this.track = document.createElement("div");
        this.track.style.position = "absolute";
        this.track.style.inset = "0";

        this.range = document.createElement("div");
        this.range.style.position = "absolute";
        this.range.style.height = "100%";
        this.range.style.background = "#4caf50";

        this.handleStart = this.createHandle();
        this.handleEnd = this.createHandle();

		this.playhead = document.createElement("div");
		this.playhead.style.position = "absolute";
		this.playhead.style.width = "2px";
		this.playhead.style.height = "100%";
		this.playhead.style.background = "#ff0000";
		this.playhead.style.cursor = "ew-resize";

        this.root.append(this.track);
        this.root.append(this.range);
        this.root.append(this.handleStart);
        this.root.append(this.handleEnd);
		this.root.append(this.playhead);

        this.bind();
        this.update();
    }

	setRange( newStart:number, newEnd:number, newDuration:number ){
		this.duration = newDuration;
		this.start = newStart;
		this.end = newEnd;
		this.update();
	}

	hide(){
		this.root.style.display = "none";
	}

	show(){
		this.root.style.display = "block";
	}

    private createHandle() {
        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.width = "10px";
        el.style.height = "100%";
        el.style.background = "#fff";
        el.style.cursor = "ew-resize";
        return el;
    }

    private bind() {
        this.handleStart.onpointerdown = (e) => {
            this.dragging = "start";
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        };

        this.handleEnd.onpointerdown = (e) => {
            this.dragging = "end";
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        };

        window.addEventListener("pointermove", (e) => {
            if (!this.dragging) return;

            const rect = this.root.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const time = x * this.duration;

            if (this.dragging === "start") {
                this.start = Math.max(0, Math.min(time, this.end));
            } else {
                this.end = Math.min(this.duration, Math.max(time, this.start));
            }

            this.update();
			if(this.onChange){
				this.onChange(this.start, this.end);
			}
        });

        window.addEventListener("pointerup", () => {
            this.dragging = null;
        });
    }

	setTime( time:number ){
		const x = time / this.duration;
		this.playhead.style.left = `${x * 100}%`;
	}

    private update() {
        const left = this.start / this.duration;
        const right = this.end / this.duration;

        this.range.style.left = `${left * 100}%`;
        this.range.style.width = `${(right - left) * 100}%`;

        this.handleStart.style.left = `${left * 100}%`;
        this.handleEnd.style.left = `${right * 100}%`;
    }

    mount(parent: HTMLElement) {
        parent.appendChild(this.root);
    }
}
