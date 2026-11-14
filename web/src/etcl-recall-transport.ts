type Timer = {remaining:number;started:number;id:ReturnType<typeof setTimeout>|null;finish:()=>void};
export class EtclRecallTransport {
  private active=false;
  private paused=false;
  private timers=new Set<Timer>();
  private gates=new Set<()=>void>();
  get isPaused():boolean { return this.paused; }
  get isActive():boolean { return this.active; }
  start():void { this.stop();this.active=true; }
  checkpoint():Promise<void> {
    if (!this.active || !this.paused) return Promise.resolve();
    return new Promise(resolve=>this.gates.add(resolve));
  }
  private schedule(timer:Timer):void {
    timer.started=performance.now();
    timer.id=setTimeout(timer.finish,Math.max(0,timer.remaining));
  }
  wait(milliseconds:number):Promise<void> {
    if (!this.active) return Promise.resolve();
    return new Promise(resolve=>{
      let settled=false;
      const timer:Timer={remaining:milliseconds,started:0,id:null,finish:()=>{
        if(settled)return;settled=true;
        if(timer.id!==null)clearTimeout(timer.id);
        this.timers.delete(timer);resolve();
      }};
      this.timers.add(timer);
      if(!this.paused)this.schedule(timer);
    });
  }
  pause():boolean {
    if(!this.active||this.paused)return false;
    this.paused=true;
    for(const timer of this.timers){
      if(timer.id!==null){clearTimeout(timer.id);timer.id=null;timer.remaining=Math.max(0,timer.remaining-(performance.now()-timer.started));}
    }
    return true;
  }
  resume():boolean {
    if(!this.active||!this.paused)return false;
    this.paused=false;
    for(const timer of this.timers)this.schedule(timer);
    for(const release of this.gates)release();
    this.gates.clear();return true;
  }
  stop():void {
    this.active=false;this.paused=false;
    for(const timer of [...this.timers])timer.finish();
    for(const release of this.gates)release();
    this.gates.clear();
  }
}
