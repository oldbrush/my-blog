import { GeistMono } from 'geist/font/mono';
import FluidCanvas from './components/FluidCanvas';

export default function Home() {
  return (
    <div className={`fixed inset-0 z-10 ${GeistMono.className}`}>
      <FluidCanvas />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <h1
            className="text-5xl md:text-7xl font-bold text-white"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          >
            Blake Newcomb
          </h1>
          <a
            href="mailto:blakenewcomb@gmail.com"
            className="mt-4 text-xl md:text-2xl text-white/70 pointer-events-auto hover:text-white transition-colors block"
            style={{ textShadow: '0 1px 5px rgba(0,0,0,0.3)' }}
          >
            Hey! I&apos;m Blake. Welcome to my groovy website.
          </a>
        </div>
      </div>
    </div>
  );
}
