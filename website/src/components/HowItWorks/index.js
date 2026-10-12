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
        <div className="text--center">
          <h2 className={styles.sectionTitle}>How Node Runners works</h2>
          <p className={styles.sectionSubtitle}>
            One universal CDK framework, a pluggable blueprint per protocol,
            and an AI assistant that drives the whole workflow.
          </p>
        </div>
        <div className="row">
          {Steps.map((step) => (
            <div key={step.number} className="col col--3">
              <div className={styles.step}>
                <div className={styles.stepNumber}>{step.number}</div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDescription}>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text--center">
          <Link
            className={styles.learnMoreLink}
            to="/docs/getting-started/why-node-runners">
            Why Node Runners instead of a managed RPC provider or DIY on EC2? →
          </Link>
        </div>
      </div>
    </section>
  );
}
