ffmpeg -i bells.wav -i drums.wav -i fx.wav -i guitar.wav -i pads.wav -i piano.wav -i plucks.wav -filter_complex amix=inputs=7:duration=first:dropout_transition=3 -codec:a libmp3lame -qscale:a 9 theme.mp3
