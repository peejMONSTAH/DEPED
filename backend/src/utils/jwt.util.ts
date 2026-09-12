import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface JwtPayload {
  userId: number;
  role: string;
  email: string;
  jti?: string;
}

export const generateAccessToken = (payload: JwtPayload): string => {
  const { jti, ...cleanPayload } = payload;
  return jwt.sign(cleanPayload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: 'eminence-hris',
    audience: 'eminence-hris-client',
    jwtid: crypto.randomUUID(),
  });
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  const { jti, ...cleanPayload } = payload;
  return jwt.sign(cleanPayload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: 'eminence-hris',
    audience: 'eminence-hris-client',
    jwtid: crypto.randomUUID(),
  });
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwt.accessSecret, {
    issuer: 'eminence-hris',
    audience: 'eminence-hris-client',
  }) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwt.refreshSecret, {
    issuer: 'eminence-hris',
    audience: 'eminence-hris-client',
  }) as JwtPayload;
};

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
};

export interface MagicLoginPayload {
  userId: number;
  email: string;
  role: string;
  txId?: number;
  type: 'MAGIC_LINK';
  jti?: string;
  exp?: number;
}

export const generateMagicToken = (payload: Omit<MagicLoginPayload, 'type'>): string => {
  return jwt.sign({ ...payload, type: 'MAGIC_LINK' }, config.jwt.accessSecret, {
    expiresIn: '48h',
    issuer: 'eminence-hris',
    audience: 'eminence-hris-client',
    jwtid: crypto.randomUUID(),
  });
};

export const verifyMagicToken = (token: string): MagicLoginPayload => {
  const decoded = jwt.verify(token, config.jwt.accessSecret, {
    issuer: 'eminence-hris',
    audience: 'eminence-hris-client',
  }) as any;

  if (decoded?.type !== 'MAGIC_LINK') {
    throw new Error('Invalid magic token payload');
  }

  return decoded as MagicLoginPayload;
};

