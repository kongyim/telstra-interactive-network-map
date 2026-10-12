// Average recent movement rather than trusting the final (often stationary) event.
export class DragVelocity {
  private samples: { x: number; y: number; time: number; duration: number }[] = [];
  private previousTime = 0;
  reset(time: number) { this.samples = []; this.previousTime = time; }
  add(x: number, y: number, time: number) {
    const duration = Math.min(50, Math.max(8, time - this.previousTime));
    this.previousTime = time;
    if (!x && !y) return;
    const last = this.samples.at(-1);
    // A reversal starts a new flick; averaging opposite directions can cancel it.
    if (last && x * last.x + y * last.y < 0) this.samples = [];
    this.samples.push({ x, y, time, duration });
    this.samples = this.samples.filter(sample => time - sample.time <= 100);
  }
  release(time: number): [number, number] {
    const last = this.samples.at(-1);
    if (!last || time - last.time >= 300) return [0, 0];
    // Keep the recent gesture through a delayed release; fade it out for a hold.
    const samples = this.samples.filter(sample => last.time - sample.time <= 100);
    const idle = Math.max(0, time - last.time);
    const fade = idle <= 100 ? 1 : (300 - idle) / 200;
    if (!samples.length) return [0, 0];
    const duration = samples.reduce((sum, sample) => sum + sample.duration, 0) + Math.max(0, time - samples.at(-1)!.time);
    return [samples.reduce((sum, sample) => sum + sample.x, 0) * 1000 * fade / duration,
      samples.reduce((sum, sample) => sum + sample.y, 0) * 1000 * fade / duration];
  }
}
