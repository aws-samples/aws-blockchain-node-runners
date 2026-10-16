import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

const Steps = [
  {
    number: '01',
    title: 'Describe what you need',
    description: (
      <>
        Tell your AI assistant the protocol and goal — for example,{' '}
        <code>@deploy a Solana RPC node optimized for cost</code>. No need to
        know instance types, storage layouts, or networking up front.
      </>
    ),
  },
  {
    number: '02',
    title: 'AI picks the blueprint',
    description: (
      <>
        Node Runners loads the matching <strong>blueprint</strong> — a
        self-contained package with the protocol&apos;s configuration,
        node-setup scripts, and healthcheck logic — and the AI recommends
        instance types, storage, and a cost estimate.
      </>
    ),
  },
  {
    number: '03',
    title: 'One CDK app deploys it',
    description: (
      <>
        The same AWS CDK application provisions the stack for any supported
        protocol — single-node for testing, or multi-node HA behind a load
        balancer for production-like evaluation.
      </>
    ),
  },
  {
    number: '04',
    title: 'Iterate with AI',
    description: (
      <>
        Run a healthcheck, diagnose sync or performance issues, or change the
        configuration — all through the same natural-language workflow, in
        minutes instead of a redeploy-and-pray cycle.
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className={styles.howItWorks}>
      <div className="container">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 className={styles.sectionTitle}>
            One universal CDK app, driven by AI
          </h2>
          <p className={styles.sectionLead}>
            A pluggable blueprint per protocol, and an AI assistant that
            drives the whole workflow from a plain-language request.
          </p>
        </div>
        <ol className={styles.flow}>
          {Steps.map((step) => (
            <li key={step.number} className={styles.flowStep}>
              <span className={styles.flowN}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <Link
          className={styles.learnMoreLink}
          to="/docs/getting-started/why-node-runners">
          Why Node Runners instead of a managed RPC provider or DIY on EC2?
        </Link>
      </div>
    </section>
  );
}
