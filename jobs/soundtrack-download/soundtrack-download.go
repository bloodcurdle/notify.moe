package main

import (
	"fmt"

	"github.com/animenotifier/arn"
	"github.com/fatih/color"
)

func main() {
	color.Yellow("Downloading soundtracks")

	defer color.Green("Finished.")
	defer arn.Node.Close()

	for track := range arn.StreamSoundTracks() {
		if track.IsDraft {
			continue
		}

		fmt.Println(track.Title)

		err := track.Download()

		if err != nil {
			color.Red(err.Error())
			continue
		}

		// Save the file information
		track.Save()
	}
}
