import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'AI-guided deployment',
    description: (
      <>
        Use AI assistants to deploy, configure, and troubleshoot blockchain
        nodes with guided workflows.
      </>
    ),
  },
  {
    title: 'Rapid experimentation',
    description: (
      <>
        Spin up nodes for any supported protocol in minutes using pre-built
        blueprints and sample configurations.
      </>
    ),
  },
  {
    title: 'Universal architecture',
    description: (
      <>
        One CDK framework supporting multiple protocols through a pluggable
        blueprint system.
      </>
    ),
  },
];

function Feature({title, description}) {
  return (
    <li className={clsx('col col--4', styles.feature)}>
      <h3>{title}</h3>
      <p>{description}</p>
    </li>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <ul className={clsx('row', styles.featureList)}>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </ul>
      </div>
    </section>
  );
}
