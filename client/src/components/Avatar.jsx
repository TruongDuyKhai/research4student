import React, { useState } from 'react';

const Avatar = ({ avatarUrl, name, size = 40, className = '' }) => {
  const [imgError, setImgError] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const showImage = !!avatarUrl && !imgError;

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
  };

  if (showImage) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        className={`avatar-image ${className}`}
        style={{ ...baseStyle, objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`avatar-fallback ${className}`}
      style={{
        ...baseStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-primary-bg)',
        color: 'var(--color-primary)',
        fontWeight: 600,
        fontSize: Math.max(10, Math.round(size * 0.45)),
      }}
    >
      {initial}
    </div>
  );
};

export default Avatar;
