import './types';

declare module './types' {
  interface Invoice {
    /** Legacy accounting alias. Runtime falls back to taxableValue when absent. */
    taxableAmount?: number;
  }
}
