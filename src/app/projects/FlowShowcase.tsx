"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Award, AudioLines, Code2, FileText, Github, ImageIcon, Play, Type, X, ArrowUpRight } from "lucide-react";
import StreamingText from "@/components/ui/StreamingText";
import FlowConnections, { type FlowPhase } from "./FlowConnections";
import { onFrame } from "@/lib/particleField";
import styles from "./flow.module.css";

const projectLinkClass = "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium font-sans bg-neutral-100 dark:bg-neutral-200/60 text-neutral-700 dark:text-neutral-700 border border-neutral-200 dark:border-neutral-300 hover:bg-accent hover:text-white hover:border-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The two rails are not the same list. Documents go *in* — manuals, regulatory
// PDFs, a corpus you point a model at — and nothing on this page hands you a
// document back. What comes out the far side of the last project is code you
// can run, so the fifth slot differs by direction.
const inputModes = [
  { name: "VIDEO", icon: Play, color: "#4a83e8" },
  { name: "AUDIO", icon: AudioLines, color: "#9569ef" },
  { name: "IMAGE", icon: ImageIcon, color: "#52aa80" },
  { name: "TEXT", icon: Type, color: "#cb9437" },
  { name: "DOCUMENTS", icon: FileText, color: "#8093ba" },
];
const outputModes = [
  ...inputModes.slice(0, 4),
  { name: "CODE", icon: Code2, color: "#2f9aa6" },
];
const projects = [
  { title: "Video Translation", image: "/projects/speech-translation-refined-v2.png", modes: [0, 1, 3], summary: "Aligning speech, meaning, and generated voice across languages.", contribution: "Developed an end-to-end multimodal, agentic workflow for understanding, translation, voice generation, and video assembly.", problem: "Translate spoken video while preserving speaker identity, timing, and audiovisual consistency.", period: { label: "INTERNSHIP PERIOD", from: ["2026-05", "MAY 2026"], to: ["2026-08", "AUG 2026"] } },
  { title: "Trigger-Bound Identity", image: "/projects/hidream-o1-lora-refined-v2.png", modes: [2, 3], summary: "Fine-tune one character into an image model, then switch that character on and off with a single trigger word.", contribution: "Fine-tuned LoRA adapters that tie a character to its own trigger word, and ran 19 controlled training runs to find the setup that keeps the character consistent without overfitting it.", problem: "Teach an image model one specific character \u2014 well enough that it stays the same person across scenes and poses \u2014 and keep that character tied to a trigger word, so it shows up when you ask for it and never leaks into prompts that don't.", period: { label: "INTERNSHIP PERIOD", from: ["2026-05", "MAY 2026"], to: ["2026-08", "AUG 2026"] } },
  { title: "Bank Customer Service Dialogue System", repo: "https://github.com/yiliey/bank-customer-service-llm", modes: [3, 4], summary: "Banking questions, answered from the documents that actually govern them.", contribution: "Built both halves: LoRA SFT and DPO post-training on Qwen2.5-3B for the domain's response style, and a Parent\u2013Child hybrid retrieval layer over banking and regulatory PDFs for the knowledge itself, which changes too often to train in.", problem: "Answer Chinese banking and regulatory questions with a domain-adapted model and a knowledge base that can be updated without retraining it.",
    details: [
      "Fine-tuned Qwen2.5-3B-Instruct with LoRA under FSDP, systematically ablating LoRA rank, learning rate, and the weight initialization approach used.",
      "Lifted BLEU-4 from 6.12 to 27.61 and ROUGE-L from 17.81 to 39.04 through the ablated LoRA fine-tuning configuration on the bank dialogue task overall.",
      "Constructed a DPO preference dataset optimizing chosen responses across domain professionalism, intent comprehension, and proactive clarification.",
      "Ablated beta and learning rate settings for DPO training, lifting reward accuracy from 0.6 to 0.85 while converging training loss from 0.7 to 0.2.",
      "Built a RAG QA system over 300+ regulatory documents using Parent-Child chunking and BGE-reranker-large, reaching 0.86 precision and 0.83 recall.",
    ],
    period: { label: "PROJECT PERIOD", from: ["2026-02", "FEB 2026"], to: ["2026-05", "MAY 2026"] },
  },
  { title: "Segmented RAG for RAPID Code", repo: "https://github.com/ZAMERT/RAPID-RAG", modes: [3, 4], summary: "Vendor manuals, organised so a model can write robot code that runs.", contribution: "Built the knowledge base and retrieval system: segmented indexing, a cross-reference document graph, and query-to-category routing over the candidate budget.", problem: "Generate runnable RAPID code for ABB industrial robots from a natural-language task, grounded in the official manuals.",
    details: [
      "Constructed a segmented RAG knowledge base from eight ABB RAPID manuals, sorting every section into definitions (2,654 chunks), syntax (598), and worked examples (843), each embedded with BAAI/bge-m3 in its own collection.",
      "Layered a document graph of 12,000 nodes and 14,000 hyperlink edges over the text index, expanding retrieval along cross-reference edges to recover procedure steps spread across linked manual pages.",
      "Designed query-to-category routing that scores the query against each collection with BM25 and bge-m3, then dynamically allocates the 20 candidate chunks across categories rather than drawing a fixed number from each.",
    ],
    period: { label: "PROJECT PERIOD", from: ["2026-05", "MAY 2026"], to: ["2026-08", "AUG 2026"] },
    award: "Silver Award, 2026 Summer Design Expo",
  },
];

export default function FlowShowcase({ embedded = false }: { embedded?: boolean }) {
  const [scrollProject, setScrollProject] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const [sequence, setSequence] = useState<{project:number|null; phase:FlowPhase}>({project:null, phase:"incoming"});
  const hoveredRef = useRef<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const selected = opened ?? hovered ?? scrollProject;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const phase = sequence.project === selected ? sequence.phase : "incoming";
  const active = selected === null ? [0, 1, 2, 3, 4] : projects[selected].modes;
  const outputs = [[0, 1], [2], [3], [4]];
  const activeOutputs = selected === null ? [] : outputs[selected];

  const updatePhase = useCallback((project:number, next:FlowPhase) => {
    if (selectedRef.current === project) setSequence({project, phase:next});
  }, []);
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
    let written = NaN;

    const stop = onFrame((_now, delta) => {
      const cards = document.querySelectorAll<HTMLElement>("[data-flow-card]");
      const card = cards[selectedRef.current ?? 0];

      const rail = page.querySelector<HTMLElement>("[data-rail]");
      let target = window.innerHeight / 2;
      if (card && rail) {
        const rect = card.getBoundingClientRect();
        // Keep the rail wholly on screen: it must clear the header above and
        // the bottom of the window below.
        const half = rail.offsetHeight / 2;
        const min = half + 96;
        const max = window.innerHeight - half - 16;
        target = Math.min(Math.max(rect.top + rect.height / 2, min), Math.max(min, max));
      }

      if (!settled || calm.matches) { current = target; settled = true; }
      else current += (target - current) * Math.min(1, 0.09 * delta);

      // `current` is a viewport coordinate, but `--rail-y` is read as `top` on a
      // fixed element — which is only the same thing while no ancestor is
      // transformed. A page transition makes one the rail's containing block and
      // shifts it by the header's height, so measure where `top: 0` actually
      // lands and write the offset back out. We already know what was last
      // written, so the offset falls out of the rail's own rect — asking
      // getComputedStyle for it instead forced a style recalculation on every
      // single frame, which is a steep price for a number we put there.
      let origin = 0;
      if (rail) {
        const railRect = rail.getBoundingClientRect();
        const top = Number.isFinite(written)
          ? written
          : parseFloat(getComputedStyle(rail).top);
        if (Number.isFinite(top)) origin = railRect.top + rail.offsetHeight / 2 - top;
      }
      written = Number((current - origin).toFixed(1));
      page.style.setProperty("--rail-y", `${written}px`);
    });
    return stop;
  }, []);

  const dismiss = useCallback(() => {
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
      {inputModes.map((mode, i) => <div key={mode.name} data-flow-mode={i} data-active={active.includes(i)} className={styles.mode} style={{ "--tone": mode.color } as CSSProperties}>
        <i data-flow-source={i}><span className={styles.chip}><mode.icon size={23} strokeWidth={1.5} /></span></i><b>{mode.name}</b>
      </div>)}
    </aside>
    <aside className={`${styles.rail} ${styles.outputRail}`} aria-label="Output modalities">
      <span className={styles.railHeading}>OUTPUTS</span>
      {outputModes.map((mode, i) => <div key={mode.name} data-flow-output-mode={i} data-active={phase === "ready" && activeOutputs.includes(i)} className={`${styles.mode} ${styles.outputMode}`} style={{ "--tone": mode.color } as CSSProperties}>
        <i data-flow-destination={i}><span className={styles.chip}><mode.icon size={23} strokeWidth={1.5} /></span></i><b>{mode.name}</b>
      </div>)}
    </aside>
    <section className={styles.projects} aria-label="Selected projects">
      {/* Same heading treatment as every other page, so this one does not read
          as a different site once you navigate into it. */}
      <header className={styles.heading}>
        <StreamingText as="h1" text="Projects" className="text-4xl font-serif font-bold text-primary mb-4" />
        <StreamingText
          as="span"
          text="Multimodal systems I have built end to end — what goes in, what comes out, and what I did in between."
          step={34}
          className="text-lg text-neutral-700 dark:text-neutral-700 max-w-2xl block"
        />
      </header>
      {projects.map((project, i) => <article data-flow-card={i} data-selected={selected === i} data-phase={selected === i ? phase : "idle"} className={styles.card} key={project.title}>
        <span data-flow-card-node className={styles.cardNode} aria-hidden="true" />
        <div className={styles.arrivalLight} aria-hidden="true" />
        <button data-project-button={i} className={styles.cardButton} aria-haspopup="dialog" aria-label={`Explore ${project.title}`} onPointerEnter={(event) => {
          if (event.pointerType === "touch" || opened !== null) return;
          opener.current = event.currentTarget; hoveredRef.current = i; setHovered(i);
        }} onPointerLeave={() => { if (opened === null) { hoveredRef.current = null; setHovered(null); } }} onClick={(event) => { opener.current = event.currentTarget; setOpened(i); }}>
          <span className={styles.index}>0{i + 1}</span>
          <div className={styles.cardCopy}><h2>{project.title}</h2><p>{project.summary}</p><strong>MY CONTRIBUTION</strong><p className={styles.contribution}>{project.contribution}</p>
            <div className={styles.tags} data-visible={selected === i}>{project.modes.map(m => <span key={m} style={{ "--tone": inputModes[m].color } as CSSProperties}>{inputModes[m].name}</span>)}</div>
          </div>
          <ArrowUpRight className={styles.exploreIcon} size={22} />
        </button>
      </article>)}
    </section>
    <FlowConnections colors={inputModes.map(m => m.color)} outColors={outputModes.map(m => m.color)} active={active} outputs={activeOutputs} phase={phase} count={projects.length} target={selected} opened={opened} onPhase={updatePhase} />
    {opened !== null && createPortal(<div className={styles.overlay} onClick={dismiss}>
      <section data-flow-detail className={styles.detail} role="dialog" aria-modal="true" aria-labelledby="flow-detail-title" onClick={e => e.stopPropagation()}>
        <header className={styles.detailHeader}><div><span>PROJECT 0{opened + 1}</span><h2 id="flow-detail-title">{projects[opened].title}</h2></div><button ref={closeButton} onClick={dismiss} aria-label="Close project details"><X size={24} /></button></header>
        <div className={styles.detailBody} data-solo={!projects[opened].image}>{projects[opened].image && <div className={styles.diagram}><Image src={projects[opened].image!} alt={`${projects[opened].title} workflow diagram`} width={1680} height={938} sizes="(max-width: 1050px) 95vw, (max-width: 1850px) 72vw, 1390px" /><a className={`${styles.fullSize} ${projectLinkClass}`} href={projects[opened].image!} target="_blank" rel="noopener noreferrer"><ImageIcon size={12} aria-hidden="true" /> View full-size image</a></div>}<div className={styles.detailCopy}>
          <label>THE WORK</label><p>{projects[opened].problem}</p><label>MY CONTRIBUTION</label><p>{projects[opened].contribution}</p>
          {projects[opened].details && <><label>WHAT I BUILT</label><ul className={styles.details}>{projects[opened].details!.map(d => <li key={d}>{d}</li>)}</ul></>}
          {projects[opened].repo && <a className={`${styles.repo} ${projectLinkClass}`} href={projects[opened].repo!} target="_blank" rel="noopener noreferrer">
            <Github size={12} aria-hidden="true" /> GitHub
          </a>}
          <div className={styles.detailTags}>{projects[opened].modes.map(m => <span key={m} style={{ "--tone": inputModes[m].color } as CSSProperties}>{inputModes[m].name}</span>)}</div>
          {(() => {
            const { period, award } = projects[opened];
            if (!period && !award) return null;
            return <div className={styles.timeline}>
              {period && <div><label>{period.label}</label><p><time dateTime={period.from[0]}>{period.from[1]}</time><span>—</span><time dateTime={period.to[0]}>{period.to[1]}</time></p></div>}
              {award && <div><label>RECOGNITION</label><p className={styles.award}><Award size={15} aria-hidden="true" />{award}</p></div>}
            </div>;
          })()}
        </div></div>
      </section>
    </div>, document.body)}
  </div>;
}
