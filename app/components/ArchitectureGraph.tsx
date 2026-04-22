"use client";

import { useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { ArchGraph, NodeType } from "@/lib/gemini";

const NODE_STYLES: Record<NodeType, { bg: string; border: string; emoji: string }> = {
  service:  { bg: "#1e3a5f", border: "#3b82f6", emoji: "⚙️" },
  database: { bg: "#1e3a2a", border: "#22c55e", emoji: "🗄️" },
  frontend: { bg: "#3a1e4a", border: "#a855f7", emoji: "🖥️" },
  external: { bg: "#3a2a1e", border: "#f97316", emoji: "🌐" },
  queue:    { bg: "#3a3a1e", border: "#eab308", emoji: "📨" },
  cache:    { bg: "#1e3a3a", border: "#06b6d4", emoji: "⚡" },
};

const NODE_W = 210;
const NODE_H = 80;

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function chooseRankdir(graph: ArchGraph): "LR" | "TB" {
  const outdegree = new Map<string, number>();
  graph.edges.forEach((e) => outdegree.set(e.source, (outdegree.get(e.source) ?? 0) + 1));
  const maxOut = Math.max(...Array.from(outdegree.values()), 0);
  // TB only for small, narrow graphs; LR handles fan-out much better
  if (graph.nodes.length <= 6 && maxOut <= 2) return "TB";
  return "LR";
}

function buildLayout(graph: ArchGraph): { nodes: Node[]; edges: Edge[] } {
  const rankdir = chooseRankdir(graph);
  const isLR = rankdir === "LR";

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir,
    ranksep: isLR ? 180 : 100,
    nodesep: isLR ? 45  : 70,
    edgesep: 30,
    marginx: 50,
    marginy: 50,
  });

  graph.nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  graph.edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const nodes: Node[] = graph.nodes.map((n) => {
    const pos = g.node(n.id);
    const style = NODE_STYLES[n.type] ?? NODE_STYLES.service;
    return {
      id: n.id,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        label: (
          <div className="text-left">
            <div className="text-xs font-bold text-white leading-snug">
              {style.emoji} {n.label}
            </div>
            {n.description && (
              <div
                className="text-[10px] text-zinc-400 mt-0.5 leading-tight"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {n.description}
              </div>
            )}
          </div>
        ),
      },
      style: {
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        borderRadius: "10px",
        padding: "10px 14px",
        width: NODE_W,
        minHeight: NODE_H,
        boxShadow: `0 0 14px ${style.border}33`,
      },
    };
  });

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ? truncate(e.label, 22) : undefined,
    animated: true,
    type: "smoothstep",
    style: { stroke: "#6366f1", strokeWidth: 1.5 },
    labelStyle: { fill: "#d4d4d8", fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: "#18181b", fillOpacity: 0.92 },
    labelBgPadding: [5, 3] as [number, number],
    labelBgBorderRadius: 4,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#8b5cf6" },
  }));

  return { nodes, edges };
}

interface Props {
  graph: ArchGraph;
}

export default function ArchitectureGraph({ graph }: Props) {
  const { nodes: initNodes, edges: initEdges } = buildLayout(graph);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildLayout(graph);
    setNodes(n);
    setEdges(e);
  }, [graph, setNodes, setEdges]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.15, includeHiddenNodes: false }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        edgesFocusable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#27272a" />
        <Controls style={{ background: "#18181b", border: "1px solid #3f3f46" }} />
        <MiniMap
          pannable
          zoomable
          style={{ background: "#18181b", border: "1px solid #3f3f46" }}
          nodeColor={(n) => {
            const type = graph.nodes.find((gn) => gn.id === n.id)?.type ?? "service";
            return NODE_STYLES[type]?.border ?? "#6366f1";
          }}
        />
      </ReactFlow>

      <div className="absolute bottom-16 left-4 flex flex-wrap gap-2 pointer-events-none">
        {(Object.entries(NODE_STYLES) as [NodeType, (typeof NODE_STYLES)[NodeType]][]).map(
          ([type, s]) => (
            <div
              key={type}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border"
              style={{ borderColor: s.border, background: s.bg, color: "#e4e4e7" }}
            >
              {s.emoji} {type}
            </div>
          )
        )}
      </div>
    </div>
  );
}
