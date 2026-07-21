import type { DocNode, Document } from '@delayance/document-model';
import { cloneDocument } from '@delayance/document-model';

export interface NodeLocation {
  parent: DocNode[] ;
  index: number;
  node: DocNode;
  parentNode: DocNode | null;
}

export function findNode(doc: Document, id: string): NodeLocation | null {
  const search = (nodes: DocNode[], parentNode: DocNode | null): NodeLocation | null => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.id === id) {
        return { parent: nodes, index: i, node, parentNode };
      }
      switch (node.type) {
        case 'section':
        case 'appendix': {
          const found = search(node.children, node);
          if (found) return found;
          break;
        }
        case 'list': {
          for (const item of node.items) {
            if (item.id === id) {
              return {
                parent: node.items as unknown as DocNode[],
                index: node.items.indexOf(item),
                node: item,
                parentNode: node,
              };
            }
            const found = search(item.content, item);
            if (found) return found;
          }
          break;
        }
        case 'table': {
          for (const row of node.rows) {
            for (const cell of row.cells) {
              const found = search(cell.content, node);
              if (found) return found;
            }
          }
          if (node.caption?.id === id) {
            return {
              parent: [node.caption],
              index: 0,
              node: node.caption,
              parentNode: node,
            };
          }
          break;
        }
        case 'figure': {
          if (node.caption?.id === id) {
            return {
              parent: [node.caption],
              index: 0,
              node: node.caption,
              parentNode: node,
            };
          }
          break;
        }
        default:
          break;
      }
    }
    return null;
  };

  return search(doc.children, null);
}

export function walkNodes(nodes: DocNode[], visit: (node: DocNode) => void): void {
  for (const node of nodes) {
    visit(node);
    switch (node.type) {
      case 'section':
      case 'appendix':
        walkNodes(node.children, visit);
        break;
      case 'list':
        for (const item of node.items) {
          visit(item);
          walkNodes(item.content, visit);
        }
        break;
      case 'table':
        if (node.caption) visit(node.caption);
        for (const row of node.rows) {
          for (const cell of row.cells) {
            walkNodes(cell.content, visit);
          }
        }
        break;
      case 'figure':
        if (node.caption) visit(node.caption);
        break;
      default:
        break;
    }
  }
}

export function getChildrenArray(doc: Document, parentId: string | null): DocNode[] | null {
  if (parentId === null) return doc.children;
  const loc = findNode(doc, parentId);
  if (!loc) return null;
  if (loc.node.type === 'section' || loc.node.type === 'appendix') {
    return loc.node.children;
  }
  if (loc.node.type === 'listItem') {
    return loc.node.content;
  }
  return null;
}

export function removeNode(doc: Document, id: string): DocNode | null {
  const loc = findNode(doc, id);
  if (!loc) return null;
  const [removed] = loc.parent.splice(loc.index, 1);
  return removed ?? null;
}

export function insertAt(
  children: DocNode[],
  node: DocNode,
  position: 'before' | 'after' | 'into',
  referenceId?: string,
): boolean {
  if (position === 'into' || !referenceId) {
    children.push(node);
    return true;
  }
  const index = children.findIndex((n) => n.id === referenceId);
  if (index < 0) return false;
  const insertIndex = position === 'before' ? index : index + 1;
  children.splice(insertIndex, 0, node);
  return true;
}

export function mutateDocument(doc: Document, mutate: (draft: Document) => void): Document {
  const draft = cloneDocument(doc);
  mutate(draft);
  return draft;
}
