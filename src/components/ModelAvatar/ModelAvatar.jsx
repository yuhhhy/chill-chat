import React from 'react';
import { getModelProviderMeta } from '../../config/modelProviders';

const ModelAvatar = ({ className = '', provider }) => {
  const model = getModelProviderMeta(provider);
  const classes = ['model-avatar', `model-avatar-${model.tone}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes} aria-hidden="true">
      {model.icon ? <img src={model.icon} alt="" /> : <span>{model.initials}</span>}
    </span>
  );
};

export default ModelAvatar;
