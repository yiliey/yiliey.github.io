"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AudioLines, FileText, Github, ImageIcon, Play, Type, X, ArrowUpRight } from "lucide-react";
import FlowConnections, { type FlowPhase } from "./FlowConnections";
import { onFrame } from "@/lib/particleField";
import styles from "./flow.module.css";

const projectLinkClass = "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium font-sans bg-neutral-100 dark:bg-neutral-200/60 text-neutral-700 dark:text-neutral-700 border border-neutral-200 dark:border-neutral-300 hover:bg-accent hover:text-white hover:border-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const modes = [
  { name: "VIDEO", icon: Play, color: "#4a83e8" },
  { name: "AUDIO", icon: AudioLines, color: "#9569ef" },
  { name: "IMAGE", icon: ImageIcon, color: "#52aa80" },
  { name: "TEXT", icon: Type, color: "#cb9437" },
  { name: "DOCUMENTS", icon: FileText, color: "#8093ba" },
];
const projects = [
  { title: "Speech Translation", image: "/projects/speech-translation-refined-v2.png", modes: [0, 1, 3], summary: "Aligning speech, meaning, and generated voice across languages.", contribution: "Developed an end-to-end multimodal, agentic workflow for understanding, translation, voice generation, and video assembly.", problem: "Translate spoken video while preserving speaker identity, timing, and audiovisual consistency." },
  { title: "Identity Personalization", image: "/projects/hidream-o1-lora-refined-v2.png", modes: [2, 3], summary: "Consistent character identity across scenes, without trigger-free leakage.", contribution: "Designed and evaluated a trigger-conditioned personalization strategy for consistent, controllable identity binding.", problem: "Maintain character identity across scenes, poses, and multi-character compositions while keeping identity activation tied to its trigger." },
  { title: "Grounded Domain LLM", repo: "https://github.com/yiliey/bank-customer-service-llm", modes: [3, 4], summary: "Domain knowledge, connected to reliable answers.", contribution: "Built a post-training and retrieval workflow connecting domain adaptation, hybrid search, reranking, and grounded generation.", problem: "Answer domain questions using a specialized language model and an updateable document knowledge base.",
    details: [
      "Fine-tuned Qwen2.5-3B-Instruct with LoRA under FSDP, systematically ablating LoRA rank, learning rate, and the weight initialization approach used.",
      "Lifted BLEU-4 from 6.1 to 29 and ROUGE-L from 17.8 to 40.1 through the ablated LoRA fine-tuning configuration on the bank dialogue task overall.",
      "Constructed a DPO preference dataset optimizing chosen responses across domain professionalism, intent comprehension, and proactive clarification.",
      "Ablated beta and learning rate settings for DPO training, lifting reward accuracy from 0.6 to 0.85 while converging training loss from 0.7 to 0.2.",
      "Built a RAG QA system over 300+ regulatory documents using Parent-Child chunking and BGE-reranker-large, reaching 0.86 precision and 0.83 recall.",
    ],
  },
];

export default function FlowShowcase({ embedded = false }: { embedded?: boolean }) {
  const [scrollProject, setScrollProject] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const [sequence, setSequence] = useState<{project:number|null; phase:FlowPhase}>({project:null, phase:"incoming"});
  const hoveredRef = useRef<number | null>(null);
  const blockedHover = useRef<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const selected = opened ?? hovered ?? scrollProject;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const phase = sequence.project === selected ? sequence.phase : "incoming";
  const active = selected === null ? [0, 1, 2, 3, 4] : projects[selected].modes;
  const outputs = [[0, 1], [2], [3]];
  const activeOutputs = selected === null ? [] : outputs[selected];

  const updatePhase = useCallback((project:number, next:FlowPhase) => {
    if (selectedRef.current === project) setSequence({project, phase:next});
  }, []);
  useEffect(() => {
    if (hovered === null || phase !== "ready" || opened !== null) return;
    const timer = window.setTimeout(() => {
      if (hoveredRef.current === hovered) setOpened(hovered);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [hovered, phase, opened]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-flow-card]"));
      // At the start of the page, viewport height must not select a later card.
      // Check this before both the center-distance and bottom-of-page rules.
      if (cards.length && window.scrollY <= 2) {
        setScrollProject(0); return;
      }
      // Activate by the card's actual viewport position, not the document scroll
      // offset (which can stay zero with zoom, a tall screen, or nested scrolling).
      if (!cards.length || cards[0].getBoundingClientRect().top > innerHeight * .82) {
        setScrollProject(null); return;
      }
      let best = 0, distance = Infinity;
      cards.forEach((card, i) => {
        const rect = card.getBoundingClientRect();
        const delta = Math.abs(rect.top + rect.height / 2 - innerHeight * .52);
        if (delta < distance) { best = i; distance = delta; }
      });
      if (window.scrollY + innerHeight >= document.documentElement.scrollHeight - 6) best = cards.length - 1;
      setScrollProject(best);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    document.querySelectorAll("[data-flow-card], [data-flow-intro]").forEach(el => observer.observe(el));
    schedule();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); };
  }, []);

  // The rails ride down the page with the project they are wired to, instead of
  // staying pinned to the middle of the window while the cards slide past them.
  // Easing rather than snapping, so the whole rig glides as you scroll.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    let current = window.innerHeight / 2;
    let settled = false;

    const stop = onFrame((_now, delta) => {
      const cards = document.querySelectorAll<HTMLElement>("[data-flow-card]");
      const card = cards[selectedRef.current ?? 0];

      let target = window.innerHeight / 2;
      if (card) {
        const rect = card.getBoundingClientRect();
        // Keep the rail wholly on screen: it must clear the header above and
        // the bottom of the window below.
        const half = page.querySelector<HTMLElement>("[data-rail]")!.offsetHeight / 2;
        const min = half + 96;
        const max = window.innerHeight - half - 16;
        target = Math.min(Math.max(rect.top + rect.height / 2, min), Math.max(min, max));
      }

      if (!settled || calm.matches) { current = target; settled = true; }
      else current += (target - current) * Math.min(1, 0.09 * delta);

      page.style.setProperty("--rail-y", `${current.toFixed(1)}px`);
    });
    return stop;
  }, []);

  const dismiss = useCallback(() => {
    blockedHover.current = Number(opener.current?.dataset.projectButton ?? -1);
    setOpened(null); setHovered(null); hoveredRef.current = null;
    opener.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (opened === null) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
      if (event.key === "Tab") {
        const controls = Array.from(document.querySelectorAll<HTMLElement>("[data-flow-detail] button, [data-flow-detail] a[href]"));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = original; window.removeEventListener("keydown", onKey); };
  }, [opened, dismiss]);

  return <div ref={pageRef} className={styles.page} data-embedded={embedded}>
    <aside data-rail className={styles.rail} aria-label="Project modalities">
      <span className={styles.railHeading}>INPUTS</span>
      {modes.map((mode, i) => <div key={mode.name} data-flow-mode={i} data-active={active.includes(i)} className={styles.mode} style={{ "--tone": mode.color } as CSSProperties}>
        <i data-flow-source={i}><span className={styles.chip}><mode.icon size={23} strokeWidth={1.5} /></span></i><b>{mode.name}</b>
      </div>)}
    </aside>
    <aside className={`${styles.rail} ${styles.outputRail}`} aria-label="Output modalities">
      <span className={styles.railHeading}>OUTPUTS</span>
      {modes.map((mode, i) => <div key={mode.name} data-flow-output-mode={i} data-active={phase === "ready" && activeOutputs.includes(i)} className={`${styles.mode} ${styles.outputMode}`} style={{ "--tone": mode.color } as CSSProperties}>
        <i data-flow-destination={i}><span className={styles.chip}><mode.icon size={23} strokeWidth={1.5} /></span></i><b>{mode.name}</b>
      </div>)}
    </aside>
    <section className={styles.projects} aria-label="Selected projects">
      {projects.map((project, i) => <article data-flow-card={i} data-selected={selected === i} data-phase={selected === i ? phase : "idle"} className={styles.card} key={project.title}>
        <span data-flow-card-node className={styles.cardNode} aria-hidden="true" />
        <div className={styles.arrivalLight} aria-hidden="true" />
        <button data-project-button={i} className={styles.cardButton} aria-haspopup="dialog" aria-label={`Explore ${project.title}`} onPointerEnter={(event) => {
          if (event.pointerType === "touch" || opened !== null || blockedHover.current === i) return;
          opener.current = event.currentTarget; hoveredRef.current = i; setHovered(i);
        }} onPointerLeave={() => { if (blockedHover.current === i) blockedHover.current = null; if (opened === null) { hoveredRef.current = null; setHovered(null); } }} onClick={(event) => { opener.current = event.currentTarget; setOpened(i); }}>
          <span className={styles.index}>0{i + 1}</span>
          <div className={styles.cardCopy}><h2>{project.title}</h2><p>{project.summary}</p><strong>MY CONTRIBUTION</strong><p className={styles.contribution}>{project.contribution}</p>
            <div className={styles.tags} data-visible={selected === i}>{project.modes.map(m => <span key={m} style={{ "--tone": modes[m].color } as CSSProperties}>{modes[m].name}</span>)}</div>
          </div>
          <ArrowUpRight className={styles.exploreIcon} size={22} />
        </button>
      </article>)}
    </section>
    <FlowConnections colors={modes.map(m => m.color)} active={active} outputs={activeOutputs} phase={phase} count={projects.length} target={selected} opened={opened} onPhase={updatePhase} />
    {opened !== null && createPortal(<div className={styles.overlay} onClick={dismiss}>
      <section data-flow-detail className={styles.detail} role="dialog" aria-modal="true" aria-labelledby="flow-detail-title" onClick={e => e.stopPropagation()}>
        <header className={styles.detailHeader}><div><span>PROJECT 0{opened + 1}</span><h2 id="flow-detail-title">{projects[opened].title}</h2></div><button ref={closeButton} onClick={dismiss} aria-label="Close project details"><X size={24} /></button></header>
        <div className={styles.detailBody} data-solo={!projects[opened].image}>{projects[opened].image && <div className={styles.diagram}><Image src={projects[opened].image!} alt={`${projects[opened].title} workflow diagram`} width={1680} height={938} sizes="(max-width: 1050px) 95vw, (max-width: 1850px) 72vw, 1390px" /><a className={`${styles.fullSize} ${projectLinkClass}`} href={projects[opened].image!} target="_blank" rel="noopener noreferrer"><ImageIcon size={12} aria-hidden="true" /> View full-size image</a></div>}<div className={styles.detailCopy}>
          <label>THE WORK</label><p>{projects[opened].problem}</p><label>MY CONTRIBUTION</label><p>{projects[opened].contribution}</p>
          {projects[opened].details && <><label>WHAT I BUILT</label><ul className={styles.details}>{projects[opened].details!.map(d => <li key={d}>{d}</li>)}</ul></>}
          {projects[opened].repo && <a className={`${styles.repo} ${projectLinkClass}`} href={projects[opened].repo!} target="_blank" rel="noopener noreferrer">
            <Github size={12} aria-hidden="true" /> GitHub
          </a>}
          <div className={styles.detailTags}>{projects[opened].modes.map(m => <span key={m} style={{ "--tone": modes[m].color } as CSSProperties}>{modes[m].name}</span>)}</div>
          <div className={styles.timeline}><label>{opened === 2 ? "PROJECT PERIOD" : "INTERNSHIP PERIOD"}</label><p><time dateTime={opened === 2 ? "2026-02" : "2026-05"}>{opened === 2 ? "FEB 2026" : "MAY 2026"}</time><span>—</span><time dateTime={opened === 2 ? "2026-05" : "2026-08"}>{opened === 2 ? "MAY 2026" : "AUG 2026"}</time></p></div>
        </div></div>
      </section>
    </div>, document.body)}
  </div>;
}
