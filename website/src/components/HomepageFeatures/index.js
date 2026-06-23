import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'AI-Guided Deployment',
    Icon: "🤖",
    description: (
       <span>
        Use AI assistants to deploy, configure, and troubleshoot blockchain nodes with guided workflows
       </span>
    ),
  },
  {
    title: 'Rapid Experimentation',
    Icon: "⚡",
    description: (
      <span>
          Spin up nodes for any supported protocol in minutes using pre-built blueprints and sample configurations
      </span>
    ),
  },
  {
    title: 'Universal Architecture',
    Icon: "🏗️",
    description: (
        <span>
            One CDK framework supporting multiple protocols through a pluggable blueprint system
        </span>
    ),
  },
];

function Feature({Icon, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        {/* <svg className={styles.featureSvg} style={{width: '40%'}} role="img" /> */}
        <span className={styles.featureUnicodeChar}>{Icon}</span>
      </div>
      <div className="text--center padding-horiz--md">
        <h2><b>{title}</b></h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
