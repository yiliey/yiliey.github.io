"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./flow.module.css";

export type FlowPhase = "incoming" | "receiving" | "outgoing" | "ready";
type Props = { colors:string[]; active:number[]; outputs:number[]; phase:FlowPhase; target:number|null; count:number; opened:number|null; onPhase:(index:number, phase:FlowPhase)=>void };
const INPUT_MS=850, RECEIVE_MS=380, OUTPUT_MS=800;

export default function FlowConnections(props:Props) {
  const svg=useRef<SVGSVGElement>(null);
  const latest=useRef(props);
  latest.current=props;
  useEffect(()=>{
    const root=svg.current;
    if (!root) return;
    const groups=Array.from(root.querySelectorAll<SVGGElement>("[data-flow-link]"));
    const items=groups.map(group=>({
      path:group.querySelector("path")!, particle:group.querySelector("circle")!,
      target:Number(group.dataset.target), mode:Number(group.dataset.flowLink),
      output:group.dataset.direction==="output", length:0,
    }));
    const query=(selector:string)=>Array.from(document.querySelectorAll<HTMLElement>(selector));
    let sources=query("[data-flow-source]");
    let destinations=query("[data-flow-destination]");
    let cards=query("[data-flow-card]");
    let cardNodes=query("[data-flow-card-node]");
    const reduced=matchMedia("(prefers-reduced-motion: reduce)");
    let raf=0, start=0, previousTarget:number|null|undefined, sentPhase:FlowPhase|undefined;
    let geometryDirty=true, pausedAt=0, lastRailY="";
    const refresh=()=>{ geometryDirty=true; };
    const observer=new ResizeObserver(refresh);
    const intro=document.querySelector("[data-flow-intro]");
    if (intro) observer.observe(intro);

    const frame=(now:number)=>{
      const state=latest.current;
      if (previousTarget!==state.target) {
        previousTarget=state.target; start=now; sentPhase=undefined; geometryDirty=true;
      }
      const elapsed=now-start;
      const phase:FlowPhase=reduced.matches ? "ready" : elapsed<INPUT_MS ? "incoming" : elapsed<INPUT_MS+RECEIVE_MS ? "receiving" : elapsed<INPUT_MS+RECEIVE_MS+OUTPUT_MS ? "outgoing" : "ready";
      if (state.target!==null && sentPhase!==phase) { sentPhase=phase; state.onPhase(state.target,phase); }

      // The rails glide with the page now, and a `top` change fires neither
      // scroll nor resize nor the ResizeObserver — so while they are moving,
      // cached endpoints would leave the curves hanging behind the icons.
      const railY=getComputedStyle(root.parentElement as Element).getPropertyValue("--rail-y");
      if (railY!==lastRailY) { lastRailY=railY; geometryDirty=true; }

      if (geometryDirty) {
        geometryDirty=false;
        // Read the nodes again rather than trusting references taken on mount:
        // an icon can be replaced in the DOM (the noise layer mounts around it),
        // and a detached node measures as a zero rect, which collapses every
        // curve onto the origin.
        sources=query("[data-flow-source]");
        destinations=query("[data-flow-destination]");
        cards=query("[data-flow-card]");
        cardNodes=query("[data-flow-card-node]");
        [...sources,...destinations,...cards,...cardNodes].forEach(el=>observer.observe(el));
        const cardRects=cards.map(el=>el.getBoundingClientRect());
        const nodeRects=cardNodes.map(el=>el.getBoundingClientRect());
        const sourceRects=sources.map(el=>el.getBoundingClientRect());
        const destRects=destinations.map(el=>el.getBoundingClientRect());
        items.forEach(item=>{
          const card=cardRects[item.target], node=nodeRects[item.target], icon=item.output ? destRects[item.mode] : sourceRects[item.mode];
          const x=item.output ? card.right : icon.right;
          const y=item.output ? card.top+card.height/2 : icon.top+icon.height/2;
          const tx=item.output ? icon.left : node.left+node.width/2;
          const ty=item.output ? icon.top+icon.height/2 : node.top+node.height/2;
          const reach=Math.max(0,(tx-x)*.5);
          item.path.setAttribute("d",`M${x},${y} C${x+reach},${y} ${tx-reach},${ty} ${tx},${ty}`);
          item.length=item.path.getTotalLength();
        });
      }

      items.forEach(item=>{
        const selected=item.target===(state.target??0);
        const enabled=(item.output ? state.outputs : state.active).includes(item.mode);
        let progress=0, alpha=0;
        if (selected && enabled && !reduced.matches && state.opened===null) {
          if (item.output) {
            if (phase==="outgoing") { progress=(elapsed-INPUT_MS-RECEIVE_MS)/OUTPUT_MS; alpha=.95; }
            else if (phase==="ready") { progress=((elapsed-INPUT_MS-RECEIVE_MS-OUTPUT_MS)/4200+item.mode*.13)%1; alpha=Math.sin(progress*Math.PI)*.6; }
          } else if (phase==="incoming" && state.target!==null) {
            const delay=state.active.indexOf(item.mode)*60;
            progress=Math.max(0,(elapsed-delay)/(INPUT_MS-delay));
            alpha=elapsed>=delay?.95:0;
          } else if (phase==="ready" || state.target===null) {
            progress=(elapsed/4200+item.mode*.13)%1; alpha=Math.sin(progress*Math.PI)*.55;
          }
        }
        if (item.output) {
          const reveal=reduced.matches||phase==="ready"?1:phase==="outgoing"?Math.min(1,(elapsed-INPUT_MS-RECEIVE_MS)/OUTPUT_MS):0;
          item.path.style.strokeDasharray=String(item.length);
          item.path.style.strokeDashoffset=String(item.length*(1-reveal));
        }
        const point=item.path.getPointAtLength(item.length*Math.max(0,Math.min(1,progress)));
        item.particle.setAttribute("cx",String(point.x));
        item.particle.setAttribute("cy",String(point.y));
        item.particle.style.opacity=String(alpha);
      });
      raf=requestAnimationFrame(frame);
    };
    const visibility=()=>{
      if (document.hidden) { pausedAt=performance.now(); cancelAnimationFrame(raf); }
      else { if (pausedAt) start+=performance.now()-pausedAt; pausedAt=0; refresh(); raf=requestAnimationFrame(frame); }
    };
    document.addEventListener("visibilitychange",visibility);
    window.addEventListener("scroll",refresh,{passive:true,capture:true});
    window.addEventListener("resize",refresh);
    raf=requestAnimationFrame(frame);
    return()=>{cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("scroll",refresh,true);window.removeEventListener("resize",refresh);};
  },[]);

  return <svg ref={svg} className={styles.links} aria-hidden="true">{Array.from({length:props.count},(_,target)=>
    (["input","output"] as const).map(direction=>props.colors.map((color,i)=>{
      const active=target===(props.target??0) && (direction==="input" ? props.active.includes(i) : props.outputs.includes(i) && (props.phase==="outgoing" || props.phase==="ready"));
      return <g key={target+direction+i} data-flow-link={i} data-target={target} data-direction={direction} data-active={active} className={styles.link} style={{"--tone":color} as CSSProperties}><path d="M0,0 L0,0"/><circle r="2.9"/></g>;
    }))
  )}</svg>;
}
