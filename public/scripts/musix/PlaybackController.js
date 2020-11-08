//@ts-check
import { NowPlayingController } from "./NowPlayingController.js";
import { Utility } from "./Utility.js";

export class PlaybackController {
    cardInterface = null;
    remotePlay = false;
    playlist = {};
    boundedHandlers = {
        startSeek: this.startSeek.bind(this),
        handleTimeUpdate: this.handleTimeUpdate.bind(this)
    };

    mediaController = null;

    constructor(cardInterface, mediaController) {
        this.cardInterface = cardInterface;

        this.mediaController = mediaController;

        //Initiate localStorage if not exist
        if (!localStorage.getItem("hasPlaybackState")) {
            //CASE: Doesn't have a playback state
            //Playback state parameters must be initialized
            localStorage.setItem("hasPlaybackState", "true");
            localStorage.setItem("currentPlaylistIndex", "0");
            localStorage.setItem("currentTrackIndex", "0");
            localStorage.setItem("currentVolume", "0.5");
        }
        if (parseInt(localStorage.getItem("currentPlaylistIndex")) >= this.cardInterface.getController("musicSource").getPlaylists().length) {
            //CASE: User had a custom playlist in the previous session
            //Current playlistIndex, trackIndex and trackTime must be reset because there is no quickPlaylist in this session and we cannot continue it
            //Choose a random playlistIndex as currentPlaylistIndex
            localStorage.setItem("currentPlaylistIndex", Utility.getRandInt(0, this.cardInterface.getController("musicSource").getPlaylists().length).toString());
            localStorage.setItem("currentTrackIndex", "0");
        }
        //NOTE: quickPlaylistIndex must always be -1 in the beginning
        localStorage.setItem("quickPlaylistIndex", "-1");

        //Add eventListeners to the mediaController and seekSlider
        this.mediaController.addEventListener("loadstart", () => {
            //Remove ability to seek
            NowPlayingController.seekSlider.removeEventListener("pointerdown", this.boundedHandlers.startSeek);
            NowPlayingController.seekSlider.removeEventListener("touchstart", this.boundedHandlers.startSeek);
        });
        this.mediaController.addEventListener("canplay", () => {
            //Add ability to seek
            NowPlayingController.seekSlider.addEventListener("pointerdown", this.boundedHandlers.startSeek);
            NowPlayingController.seekSlider.addEventListener("touchstart", this.boundedHandlers.startSeek);
        });
        //Add onplay to mediaController for displaying current state on navigationControl
        this.mediaController.addEventListener("play", () => {
            NowPlayingController.setState("playback", true);
        });
        //Add ontimeupdate to mediaController for updating state and UI
        this.mediaController.addEventListener("timeupdate", this.boundedHandlers.handleTimeUpdate);
        //Add onwaiting to mediaController
        this.mediaController.addEventListener("waiting", () => {
            //Remove ability to seek
            NowPlayingController.seekSlider.removeEventListener("pointerdown", this.boundedHandlers.startSeek);
            NowPlayingController.seekSlider.removeEventListener("touchstart", this.boundedHandlers.startSeek);
        });
        //Add onplay to mediaController for displaying current state on navigationControl
        this.mediaController.addEventListener("pause", () => {
            NowPlayingController.setState("playback", false);
        });
        //Add onended to mediaController for playing next track
        this.mediaController.addEventListener("ended", () => {
            this.skipTrack("next");
        });

        //Reinstate mediaController to last position
        this.setVolume(parseFloat(localStorage.getItem("currentVolume")));
        this.setPlaylist(this.cardInterface.getController("musicSource").getPlaylistAt(parseInt(localStorage.getItem("currentPlaylistIndex"))));
        this.loadTrackAt(parseInt(localStorage.getItem("currentTrackIndex")), false);
    }

    setRemotePlay(remotePlay) {
        this.remotePlay = remotePlay;
        NowPlayingController.setState("remotePlay", remotePlay);

        if (remotePlay) {
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-disable"
            });
        }
    }

    isRemotePlay() {
        return this.remotePlay;
    }

    toggleRemotePlay() {
        if (this.remotePlay) {
            this.setRemotePlay(false);
            if (window.frameElement) {
                window.parent.shellInterface.throwAlert("RemotePlay is off", "You no longer control other instances", "From now on every action you take on Musix won't affect other instances. YOu can control your instance", null, "OK", null);
            }
        } else {
            this.setRemotePlay(true);
            if (window.frameElement) {
                window.parent.shellInterface.throwAlert("RemotePlay is on", "You are in control of other instances", "From now on every action you take on Musix won't affect the current instance. Instead they are reflected throughout all other instances which are connected to the web socket server\n\nAll other clients are expected to interact with the DOM before RemotePlay can work properly", null, "OK", null);
            }
        }
    }

    setVolume(volume) {
        if (this.remotePlay) {
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-set-volume",
                volume: volume
            });
        }
        this.mediaController.volume = volume;
        //Update playback state
        localStorage.setItem("currentVolume", volume.toString());
        //Update UI
        NowPlayingController.updateViewSection("volume", volume);
    }

    setPlaylist(playlist) {
        if (this.remotePlay) {
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-set-playlist",
                playlist: playlist
            });
        }
        this.playlist = playlist;
        //Update playback state
        localStorage.setItem("currentPlaylistIndex", playlist.index.toString());
        //Update UI
        NowPlayingController.updateViewSection("playlist", playlist);
    }

    loadTrackAt(trackIndex, autoplay) {
        if (this.remotePlay) {
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-load-track-at",
                trackIndex: trackIndex,
                autoplay: autoplay
            });
        }

        const track = this.playlist.tracks[trackIndex];

        //Request lyrics if a URI is present
        // const lyricsDisplay = this.view.querySelector("#lyricsDisplay");
        // lyricsDisplay.scrollTo(0, 0);
        // if (track.lyricsFileName) {
        //     fetch(`/musix/lyrics/${encodeURIComponent(track.lyricsFileName)}`)
        //         .then(response => response.json())
        //         .then(data => {
        //             for (let i = 0; i < data.blocks.length; i++) {
        //                 if (data.blocks[i][0].startsWith("Chorus") || data.blocks[i][0].startsWith("(x")) {
        //                     data.blocks[i][0] = `<span style="color: var(--themeColor)">${data.blocks[i][0]}</span>`;
        //                 }
        //                 data.blocks[i] = data.blocks[i].join("<br />");
        //             }
        //             lyricsDisplay.innerHTML = data.blocks.join("<br /><br />");
        //         })
        //         .catch(() => {
        //             lyricsDisplay.innerHTML = '<span style="color: var(--themeColor)">Aw! Snap</span><br />Couldn\'t connect with the server';
        //         });
        // } else {
        //     lyricsDisplay.innerHTML = "";
        // }

        //Update mediaController
        this.cardInterface.getController("musicSource").determineTrackUrl(track).then((trackUrl) => {
            this.mediaController.src = trackUrl;
            this.mediaController.currentTime = 0;

            if (autoplay) {
                this.togglePlay();
            }
        });

        //Update playback state
        localStorage.setItem("currentTrackIndex", trackIndex.toString());

        //Update UI
        const mediaMetadata = {
            title: track.title,
            artist: track.artist,
            album: this.playlist.name,
            artwork: [
                { src: "images/musix/launcher_192.png", sizes: "192x192", type: "image/png" }
            ]
        };

        if (track.artist) {
            mediaMetadata.artist = track.artist;
        } else {
            mediaMetadata.artist = "Unknown Artist";
        }

        if (track.title) {
            mediaMetadata.title = track.title;
        } else {
            mediaMetadata.title = track.path.slice(track.path.lastIndexOf("/") + 1, track.path.lastIndexOf("."));
        }

        NowPlayingController.updateViewSection("track", mediaMetadata);
    }

    seekTo(time) {
        if (this.remotePlay) {
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-seek-to",
                time: time
            });
        }

        this.mediaController.currentTime = time;
        //NOTE: UI Updating will be done by the ontimeupdate handler
    }

    togglePlay() {
        if (this.remotePlay) {
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-toggle-play"
            });
        } else {
            if (this.mediaController.paused) {
                this.mediaController.play();
                navigator.mediaSession.playbackState = "playing";
            } else {
                this.mediaController.pause();
                navigator.mediaSession.playbackState = "paused";
            }
        }
    }

    skipTrack(direction) {
        const upcomingTrackPosition = this.cardInterface.getController("musicSource").queryRelativeTrackPosition(direction);
        const playlist = this.cardInterface.getController("musicSource").getPlaylistAt(upcomingTrackPosition.playlistIndex);

        this.setPlaylist(playlist);

        if (this.remotePlay) {
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-set-playlist",
                playlist: playlist
            });
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-load-track-at",
                trackIndex: upcomingTrackPosition.trackIndex
            });
            this.cardInterface.getWebSocket().emit("broadcast-event", {
                eventName: "remote-toggle-play",
                trackIndex: upcomingTrackPosition.trackIndex
            });
            //NOTE: Plying the song immediately must only be done only when not in a remote play session
            this.loadTrackAt(upcomingTrackPosition.trackIndex, false);
        } else {
            //NOTE: Plying the song immediately must only be done only when not in a remote play session
            this.loadTrackAt(upcomingTrackPosition.trackIndex, true);
        }
    }

    //EVENT HANDLER METHODS
    startSeek(event) {
        //NOTE: Seek isn't done in realtime. It is done as soon as the user leaves the seekSlider
        NowPlayingController.startSlide(event, 196.5, 343.5, () => {
            //Remove ontimeupdate from mediaController
            this.mediaController.removeEventListener("timeupdate", this.boundedHandlers.handleTimeUpdate);
        }, () => {
            //Update the seeked time
            const seekedTime = Utility.formatTime(Utility.getCircularSliderValue(NowPlayingController.seekSlider, 196.5, 343.5, this.mediaController.duration));
            NowPlayingController.updateViewSection("time", seekedTime);
        }, () => {
            //NOTE: We have to check is RemotePlay enabled
            if (this.remotePlay) {
                //NOTE: Only broadcasting the params is enough. No need to update our client
                //Get sliderValue
                const seekedTime = Utility.getCircularSliderValue(NowPlayingController.seekSlider, 196.5, 343.5, this.mediaController.duration);
                this.seekTo(seekedTime);
            } else {
                //Get sliderValue
                const seekedTime = Utility.getCircularSliderValue(NowPlayingController.seekSlider, 196.5, 343.5, this.mediaController.duration);
                //Set mediaController's currentTime to match seekedTime
                this.mediaController.currentTime = seekedTime;
                //Reinstate removed ontimeupdate of mediaController
                this.mediaController.addEventListener("timeupdate", this.boundedHandlers.handleTimeUpdate);
            }
        });
    }

    handleTimeUpdate() {
        //Update UI
        const elapsedTime = Utility.formatTime(this.mediaController.currentTime);
        NowPlayingController.updateViewSection("seek", [this.mediaController.duration, this.mediaController.currentTime, elapsedTime[0], elapsedTime[1]]);
    }
}