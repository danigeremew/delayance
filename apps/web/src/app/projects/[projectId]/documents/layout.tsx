import type { ReactNode } from 'react';
import { DocumentWorkspace } from '@/components/document-workspace';

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DocumentWorkspace />
      {children}
    </>
  );
}
