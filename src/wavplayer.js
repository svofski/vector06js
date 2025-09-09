function WavPlayer()
{
    this.wav = null;
    this.sample = 0;
    this.loaded = false;

}

WavPlayer.prototype.setwav = function(wav, onfinished)
{
    this.wav = wav;
    this.ratio = 59904 * 50 / wav.sampleRate;
    this.playhead = 0;
    this.frac = 0;
    this.loaded = true;
    this.sample = 0;
    this.onfinished = onfinished;
}

WavPlayer.prototype.advance = function(instruction_time)
{
    if (this.loaded) {
        if(this.playhead < this.wav.dataSamples.length) {
            this.frac += instruction_time;
            if (this.frac > this.ratio) {
                this.frac -= this.ratio;
                ++this.playhead;

                if (this.wav.bitsPerSample === 8) {
                    this.sample = this.wav.dataSamples[this.playhead] > 127 ? 1 : 0;
                }
                else {
                    this.sample = this.wav.dataSamples[this.playhead] > 0 ? 1 : 0;
                }
            }
        }
        else {
            this.loaded = false;

            console.log("wavplayer finished");
            this.onfinished && this.onfinished(0);
        }
    }
}

