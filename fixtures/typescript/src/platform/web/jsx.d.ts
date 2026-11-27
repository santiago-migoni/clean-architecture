// JSX typing for the view layer (a framework detail): any intrinsic element is accepted.
declare namespace JSX {
  interface IntrinsicElements {
    [element: string]: Record<string, unknown>;
  }
}
