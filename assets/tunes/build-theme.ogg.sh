# @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3; GAME_BOOK.md §26; INCONSISTENCY_REPORT.md §IR-008 (no dedicated audio specification).
ffmpeg -i bells.wav -i drums.wav -i fx.wav -i guitar.wav -i pads.wav -i piano.wav -i plucks.wav -filter_complex amix=inputs=7:duration=first:dropout_transition=3 -codec:a libvorbis -qscale:a 0 theme.ogg
