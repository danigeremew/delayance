import Image from 'next/image';
import type { ReactNode } from 'react';

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div id="delayance-auth-page">
      <main className="auth-shell">
        <section className="showcase" aria-label="Delayance document workspace preview">
          <div className="mockup-stage" aria-hidden="true">
            <div className="sheet one" />
            <div className="sheet two" />
            <div className="editor">
              <div className="windowbar">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <aside className="sidebar">
                {['Documents', 'Search', 'Starred', 'Shared', 'Templates'].map((label, index) => (
                  <div className={`side-item${index === 0 ? ' active' : ''}`} key={label}>
                    <span className="side-icon" />
                    {label}
                  </div>
                ))}
                <div className="side-spacer" />
                <div className="side-item">
                  <span className="side-icon" />
                  Trash
                </div>
              </aside>
              <article className="document">
                <div className="doc-search" />
                <h3>Project Plan</h3>
                {['w1', 'w2', 'w3', 'w4', 'w5', 'w1', 'w6'].map((width, index) => (
                  <div className={`line ${width}`} key={index} />
                ))}
                <span className="cursor" />
                <div className="toolbar">
                  <span>B</span>
                  <span>
                    <em>I</em>
                  </span>
                  <span>
                    <u>U</u>
                  </span>
                  <span>↗</span>
                  <span>•≡</span>
                </div>
              </article>
              <aside className="outline">
                <div className="outline-tabs">
                  <span>Outline</span>
                  <span>Comments</span>
                </div>
                {['Introduction', 'Goals', 'Strategy', 'Timeline', 'Next Steps'].map(
                  (label, index) => (
                    <div className={`outline-item${index === 2 ? ' active' : ''}`} key={label}>
                      {index + 1}. {label}
                    </div>
                  ),
                )}
              </aside>
            </div>
            <div className="floating-card">
              <div className="file-icon">▤</div>
              <div className="small-lines">
                <i />
                <i />
              </div>
            </div>
            <div className="pointer" />
          </div>
          <div className="showcase-copy">
            <h2>Document Workspace</h2>
            <p>Draft, structure, and refine your documents in one focused workspace.</p>
            <div className="carousel" aria-hidden="true">
              <span className="active" />
              <span />
              <span />
            </div>
          </div>
        </section>
        <section className="signin">
          <div className="signin-inner">
            <div className="brand">
              <Image
                className="brand-logo-image"
                src="/delayance-logo.png"
                alt=""
                width={42}
                height={42}
              />
              <span className="brand-name">Delayance</span>
            </div>
            <div className="intro">
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  id,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
      />
    </div>
  );
}
