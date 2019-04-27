function loadScript(src) {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.type = 'text/javascript';
		script.onload = () => {
			resolve();
		};
		script.onerror = () => {
			console.log("Failed to load script", src);
			reject();
		};
		script.src = src;
		document.head.appendChild(script);
	});
}

function loadStyle(src) {
	return new Promise((resolve, reject) => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.type = 'text/css';
		link.onload = () => {
			resolve();
		};
		link.onerror = () => {
			console.log("Failed to load CSS", src);
			reject();
		};
		link.href = src;
		document.head.appendChild(link);
	});
}

function waitForGlobalObject(objectName, objectNextName) {
	return new Promise((resolve) => {
		function check() {
			if ((window[objectName] !== undefined)
				&& ((objectNextName === undefined) || window[objectName][objectNextName] !== undefined)) {
				resolve();
			} else {
				setTimeout(check, 200);
			}
		}

		check();
	});
}


class P2pVideoPlayer {
	/**
	 * @param {string} videoContainerSelector
	 * @param {object} data
	 * @param {string} data.videoSource
	 * @param {string} data.poster
	 * @param {boolean} data.mute = false
	 * @param {boolean} data.autoPlay = true
	 * @param {boolean} data.playInline = true
	 * @param {boolean} data.recycleVideo = Clappr.Browser.isMobile
	 * @param {array} data.subtitles
	 * @param {boolean} data.mouseOverAutoPlay = false
	 * @param {array} data.assTracks
	 * @param {array} data.externalTracks
	 * @param {object} data.scrubThumbnails
	 * @param {number} data.scrubThumbnails.backdropHeight
	 * @param {number} data.scrubThumbnails.spotlightHeight
	 * @param {number} data.scrubThumbnails.backdropMinOpacity
	 * @param {number} data.scrubThumbnails.backdropMaxOpacity
	 * @param {array}  data.scrubThumbnails.sprites
	 * @param {number} data.scrubThumbnails.numThumbs
	 * @param {number} data.scrubThumbnails.thumbWidth
	 * @param {number} data.scrubThumbnails.thumbHeight
	 * @param {number} data.scrubThumbnails.numColumns
	 * @param {number} data.scrubThumbnails.timeInterval
	 */
	constructor(videoContainerSelector, data = {}) {
		this.videoContainer = document.querySelector(videoContainerSelector);
		// cleanup any child of video container
		while (this.videoContainer.hasChildNodes()) {
			this.videoContainer.removeChild(this.videoContainer.lastChild);
		}
		this.data = data;
		if (undefined === data.mute) data.mute = false;
		if (undefined === data.autoPlay) data.autoPlay = true;
		if (undefined === data.playInline) data.playInline = true;
		if (undefined === data.recycleVideo) data.recycleVideo = Clappr.Browser.isMobile;
	}

	async initSubtitle() {
		await loadScript("/subtitles-octopus.js");
	}

	async initDebug() {
		await loadScript("https://cdn.jsdelivr.net/npm/p2p-graph@1.2.2/p2p-graph.min.js");
		await loadScript("https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js");
		await loadScript("https://cdnjs.cloudflare.com/ajax/libs/rickshaw/1.6.3/rickshaw.min.js");
		await loadStyle("https://cdnjs.cloudflare.com/ajax/libs/rickshaw/1.6.3/rickshaw.min.css");

		this.graph = new P2PGraph("#graph");
		this.graph.add({ id: "me", name: "You", me: true });
		this.initChart();
	}

	async init() {
		// await loadScript("/p2p-player.min.js");

		this.isP2PSupported = p2pml.core.HybridLoader.isSupported();
		// this.isP2PSupported = false;
		this.loadSpeedTimespan = 10; // seconds

		this.isDebug = /[&?]?debug=(true|1)/.test(location.search);
		if (this.isDebug) {
			await this.initDebug();
		}

		if (this.data.assTracks && this.data.assTracks.length > 0) {
			await this.initSubtitle();
		}

		this.initVideo();
	}

	initVideo() {
		const me = this;
		this.downloadStats = [];
		this.downloadTotals = { http: 0, p2p: 0 };
		this.uploadStats = [];
		this.uploadTotal = 0;

		const p2pConfig = {
			segments: {
				// swarmId: '111', default manifestUrl without query is used
				mapRangeHeaderToQuery: {
					startKey: 'byteStart',
					endKey: 'byteEnd',
				},
				forwardSegmentCount: 50,
			},
			loader: {
				// how long to store the downloaded segments for P2P sharing
				cachedSegmentExpiration: 86400000,
				// count of the downloaded segments to store for P2P sharing
				cachedSegmentsCount: 1000,

				// first 4 segments (priorities 0, 1, 2 and 3) are required buffer for stable playback
				requiredSegmentsPriority: 3,

				// each 1 second each of 10 segments ahead of playhead position gets 6% probability for random HTTP download
				httpDownloadMaxPriority: 9,
				httpDownloadProbability: 0.06,
				httpDownloadProbabilityInterval: 1000,

				// disallow randomly download segments over HTTP if there are no connected peers
				httpDownloadProbabilitySkipIfNoPeers: true,

				// P2P will try to download only first 51 segment ahead of playhead position
				p2pDownloadMaxPriority: 50,

				// 1 second timeout before retrying HTTP download of a segment in case of an error
				httpFailedSegmentTimeout: 1000,

				// number of simultaneous downloads for P2P and HTTP methods
				simultaneousP2PDownloads: 20,
				simultaneousHttpDownloads: 3,

				// enable mode, that try to prevent HTTP downloads on stream start-up
				httpDownloadInitialTimeout: 120000, // try to prevent HTTP downloads during first 2 minutes
				httpDownloadInitialTimeoutPerSegment: 17000, // try to prevent HTTP download per segment during first 17 seconds

				// allow to continue aborted P2P downloads via HTTP
				httpDownloadRanges: true,


				trackerAnnounce: [
					'wss://tracker.commufield.com',
					'wss://tracker.openwebtorrent.com',
				],
				// segmentUrlBuilder: function (segment) {
				// 	let range = segment.range.slice(6).split('-');
				// 	segment.range = undefined;
				// 	return `${segment.url}${(segment.url.indexOf('?') !== -1) ? '&' : '?'}byteStart=${range[0]}&byteEnd=${range[1]}`;
				// },
				xhrSetup: function (xhr, url) {
					// console.log('xhrSetup', url);
					//					if (url.indexOf('?token=') !== -1) {
					//						const matches = url.match(/\?token=([^&]+)&/);
					//						if (matches && matches.length === 2) {
					//							const token = matches[1];
					//							url = url.replace(/\?token=([^&]+)&/, '?');
					//							xhr.open('GET', url);
					//							xhr.setRequestHeader('Content-Language', token);						}
					//					}
				}
			},
		};

		shaka.polyfill.installAll();
		if (!shaka.Player.isBrowserSupported()) {
			console.error("shaka player browser is not supported");
			return;
		}

		this.engine = this.isP2PSupported ? new p2pml.shaka.Engine(p2pConfig) : undefined;

		let scrubThumbnails;
		if (this.data.scrubThumbnails) {
			scrubThumbnails = {
				backdropHeight: this.data.scrubThumbnails.backdropHeight || 0,
				spotlightHeight: this.data.scrubThumbnails.spotlightHeight || 96,
				backdropMinOpacity: this.data.scrubThumbnails.backdropMinOpacity || 0.4,
				backdropMaxOpacity: this.data.scrubThumbnails.backdropMaxOpacity || 1,
				thumbs: [],
			};

			const timeInterval = this.data.scrubThumbnails.timeInterval || 24.1875;
			for (let i = 0; i < this.data.scrubThumbnails.sprites.length; i++) {
				let thumbArray = ClapprThumbnailsPlugin.buildSpriteConfig(this.data.scrubThumbnails.sprites[i],
					this.data.scrubThumbnails.numThumbs, this.data.scrubThumbnails.thumbWidth,
					this.data.scrubThumbnails.thumbHeight, this.data.scrubThumbnails.numColumns,
					timeInterval, i * this.data.scrubThumbnails.numThumbs * timeInterval);

				for (let thumb of thumbArray) {
					scrubThumbnails.thumbs.push(thumb);
				}
			}
		}

		let clapprOptions = {
			parent: this.videoContainer,
			plugins: {
				playback: [DashShakaPlayback],
				core: [LevelSelector]
			},
			width: "100%",
			height: "100%",
			mute: this.data.mute,
			autoPlay: this.data.autoPlay,
			playback: {
				playInline: this.data.playInline,
				recycleVideo: this.data.recycleVideo,
			},
			shakaOnBeforeLoad: (shakaPlayer) => {
				this.shakaPlayer = shakaPlayer;
			},
			shakaConfiguration: {
				// streaming: {
				// 	bufferBehind: 60,
				// 	// bufferingGoal:
				// 	// rebufferingGoal: 4
				// 	retryParameters: {
				// 		 backoffFactor: 2,
				// 		 baseDelay: 1000,
				// 		 fuzzFactor: 0.5,
				// 		 maxAttempts: 3,
				// 		 timeout: 0,
				// 	}
				// }
			},
			shakaOnBeforeLoad: (shakaPlayerInstance) => {
				console.log('shakaOnBeforeLoad');
				shakaPlayerInstance.getNetworkingEngine().registerRequestFilter(function (type, request) {
					console.log('shaka request filter', type, request);
				});
				if (this.isP2PSupported) {
					this.engine.initShakaPlayer(shakaPlayerInstance);
				}
			},
			events: {
				onReady: () => {
					const video = this.videoContainer.getElementsByTagName("video")[0];
					if (this.data.assTracks && this.data.assTracks.length > 0) {
						const track = this.data.assTracks[0];
						window.SubtitlesOctopusOnLoad = function () {
							const options = {
								video: video,
								subUrl: track.src,
								debug: this.isDebug,
								workerUrl: '/subtitles-octopus-worker.js'
							};
							window.octopusInstance = new SubtitlesOctopus(options); // You can experiment in console
						};
						if (SubtitlesOctopus) {
							SubtitlesOctopusOnLoad();
						}
					}
				}
			}
		};

		if (this.data.source) clapprOptions.source = this.data.source;
		if (this.data.sources) clapprOptions.sources = this.data.sources;


		if (scrubThumbnails) {
			clapprOptions.scrubThumbnails = scrubThumbnails;
			clapprOptions.plugins.core.push(ClapprThumbnailsPlugin);
		}

		if (this.data.poster) clapprOptions.poster = this.data.poster;
		if (this.data.externalTracks) clapprOptions.externalTracks = this.data.externalTracks;

		this.player = new Clappr.Player(clapprOptions);

		if (this.isP2PSupported && this.isDebug) {
			this.engine.on(p2pml.core.Events.PieceBytesDownloaded, this.onBytesDownloaded.bind(this));
			this.engine.on(p2pml.core.Events.PieceBytesUploaded, this.onBytesUploaded.bind(this));
			let trackerAnnounce = this.engine.getSettings().loader.trackerAnnounce;
			if (Array.isArray(trackerAnnounce)) {
				document.getElementById("announce").innerHTML = trackerAnnounce.join("<br />");
			}
			this.refreshChart();
			this.refreshGraph();
		}
	}

	initChart() {
		let chartConf = {
			element: document.querySelector("#chart"),
			renderer: 'multi',
			interpolation: "basis",
			stack: false,
			min: 'auto',
			strokeWidth: 1,
			series: [
				{ name: "Upload P2P", color: "#88eab9", data: [], renderer: 'area' },
				{ name: " - P2P", color: "#88b9ea", data: [], renderer: 'area' },
				{ name: " - HTTP", color: "#eae288", data: [], renderer: 'area' },
				{ name: "Download", color: "#f64", data: [], renderer: 'line' }
			]
		};

		this.chart = new Rickshaw.Graph(chartConf);
		new Rickshaw.Graph.Axis.X({
			graph: this.chart,
			tickFormat: () => ''
		});
		new Rickshaw.Graph.Axis.Y({
			graph: this.chart,
			orientation: 'left',
			element: document.getElementById('y_axis')
		});
		this.legend = new Rickshaw.Graph.Legend({
			graph: this.chart,
			element: document.getElementById('legend')
		});
		this.legendTotals = new Rickshaw.Graph.Legend({
			graph: this.chart,
			element: document.getElementById("legend-totals")
		});
		this.chart.render();

		setInterval(this.updateChartData.bind(this), 500);
		let chartResize = () => {
			chartConf.width = this.chart.element.clientWidth;
			this.chart.configure(chartConf);
			this.chart.render();
		};

		chartResize();
		window.addEventListener("resize", chartResize);
	}

	refreshChart() {
		if (!this.chart) {
			return;
		}
		let data0 = this.chart.series[0].data;
		let data1 = this.chart.series[1].data;
		let data2 = this.chart.series[2].data;
		let data3 = this.chart.series[3].data;
		let lastX = data0.length > 0 ? data0[data0.length - 1].x : -1;
		let seriesDataMapper = (currentValue, index) => ({ x: index + lastX + 1, y: 0 });
		data0.length = 0;
		data1.length = 0;
		data2.length = 0;
		data3.length = 0;
		let stubData = Array.apply(null, Array(200)).map(seriesDataMapper);
		data0.push.apply(data0, stubData.slice(0));
		data1.push.apply(data1, stubData.slice(0));
		data2.push.apply(data2, stubData.slice(0));
		data3.push.apply(data3, stubData.slice(0));
		this.chart.update();
	}

	updateChartData() {
		let downloadSpeed = this.getDownloadSpeed();
		let http = Number((downloadSpeed.http * 8 / 1000000).toFixed(2));
		let p2p = Number((downloadSpeed.p2p * 8 / 1000000).toFixed(2));
		let total = Number((http + p2p).toFixed(2));
		let upload = Number(this.getUploadSpeed() * 8 / 1000000).toFixed(2);
		let data0 = this.chart.series[0].data;
		let data1 = this.chart.series[1].data;
		let data2 = this.chart.series[2].data;
		let data3 = this.chart.series[3].data;
		let x = data0.length > 0 ? data0[data0.length - 1].x + 1 : 0;
		data0.shift();
		data1.shift();
		data2.shift();
		data3.shift();
		data0.push({ x: x, y: -upload });
		data1.push({ x: x, y: total });
		data2.push({ x: x, y: http });
		data3.push({ x: x, y: total });
		this.chart.update();
		this.formatChartLegendLine(0, total);
		this.formatChartLegendLine(1, http);
		this.formatChartLegendLine(2, p2p);
		this.formatChartLegendLine(3, upload);
		this.updateLegendTotals();
	}

	formatChartLegendLine(index, speed) {
		if (this.legend) {
			let line = this.legend.lines[index];
			line.element.childNodes[1].textContent = line.series.name + ' - ' + speed + ' Mbit/s';
		}
	}

	updateLegendTotals() {
		if (!this.legendTotals) {
			return;
		}
		let httpMb = this.downloadTotals.http / 1048576;
		let p2pMb = this.downloadTotals.p2p / 1048576;
		let totalMb = httpMb + p2pMb;
		let uploadMb = this.uploadTotal / 1048576;
		if (totalMb !== 0) {
			this.legendTotals.lines[0].element.childNodes[1].textContent
				= "Download - "
				+ Number(totalMb).toFixed(1) + " MiB";
			this.legendTotals.lines[1].element.childNodes[1].textContent
				= " - HTTP - "
				+ Number(httpMb).toFixed(1) + " MiB - "
				+ Number((httpMb * 100) / totalMb).toFixed(0) + "%";
			this.legendTotals.lines[2].element.childNodes[1].textContent
				= " - P2P - "
				+ Number(p2pMb).toFixed(1) + " MiB - "
				+ Number((p2pMb * 100) / totalMb).toFixed(0) + "%";
			this.legendTotals.lines[3].element.childNodes[1].textContent
				= "Upload P2P - "
				+ Number(uploadMb).toFixed(1) + " MiB";
		}
	}

	getDownloadSpeed() {
		let startingPoint = performance.now() - (this.loadSpeedTimespan * 1000);
		let httpSize = 0;
		let p2pSize = 0;
		let i = this.downloadStats.length;
		while (i--) {
			let stat = this.downloadStats[i];
			if (stat.timestamp < startingPoint) {
				break;
			}
			if (stat.method === "p2p") {
				p2pSize += stat.size;
			} else if (stat.method === "http") {
				httpSize += stat.size;
			}
		}
		this.downloadStats.splice(0, i + 1);
		return { p2p: p2pSize / this.loadSpeedTimespan, http: httpSize / this.loadSpeedTimespan };
	}

	getUploadSpeed() {
		let startingPoint = performance.now() - (this.loadSpeedTimespan * 1000);
		let size = 0;
		let i = this.uploadStats.length;
		while (i--) {
			let stat = this.uploadStats[i];
			if (stat.timestamp < startingPoint) {
				break;
			}
			size += stat.size;
		}
		this.uploadStats.splice(0, i + 1);
		return size / this.loadSpeedTimespan;
	}

	onBytesDownloaded(method, size) {
		this.downloadStats.push({ method: method, size: size, timestamp: performance.now() });
		this.downloadTotals[method] += size;
	}

	onBytesUploaded(method, size) {
		this.uploadStats.push({ size: size, timestamp: performance.now() });
		this.uploadTotal += size;
	}

	refreshGraph(p2pLoader) {
		if (!this.graph) {
			return;
		}
		let nodes = this.graph.list();
		for (let i = 0; i < nodes.length; i++) {
			if (nodes[i].id !== "me") {
				this.graph.disconnect("me", nodes[i].id);
				this.graph.remove(nodes[i].id);
			}
		}
		if (this.isP2PSupported) {
			this.engine.on(p2pml.core.Events.PeerConnect, this.onPeerConnect.bind(this));
			this.engine.on(p2pml.core.Events.PeerClose, this.onPeerClose.bind(this));
		}
	}

	onPeerConnect(peer) {
		if (!this.graph.hasPeer(peer.id)) {
			this.graph.add({ id: peer.id, name: peer.remoteAddress || 'Unknown' });
			this.graph.connect("me", peer.id);
		}
	}

	onPeerClose(id) {
		if (this.graph.hasPeer(id)) {
			this.graph.disconnect("me", id);
			this.graph.remove(id);
		}
	}
}

window.P2pVideoPlayer = P2pVideoPlayer;
