import type { ReactNode } from 'react';

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className ?? ''}`}>{children}</div>;
}

export function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value mono">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="empty">{message}</div>;
}
