require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

if (!window.p2pml) {
    window.p2pml = {};
}

window.p2pml.shaka = require("p2p-media-loader-shaka");

},{"p2p-media-loader-shaka":"p2p-media-loader-shaka"}],2:[function(require,module,exports){
"use strict";
/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const p2p_media_loader_core_1 = require("p2p-media-loader-core");
const segment_manager_1 = require("./segment-manager");
const integration = require("./integration");
class Engine extends events_1.EventEmitter {
    static isSupported() {
        return p2p_media_loader_core_1.HybridLoader.isSupported();
    }
    constructor(settings = {}) {
        super();
        this.loader = new p2p_media_loader_core_1.HybridLoader(settings.loader);
        this.segmentManager = new segment_manager_1.SegmentManager(this.loader, settings.segments);
        Object.keys(p2p_media_loader_core_1.Events)
            .map(eventKey => p2p_media_loader_core_1.Events[eventKey])
            .forEach(event => this.loader.on(event, (...args) => this.emit(event, ...args)));
    }
    destroy() {
        this.loader.destroy();
        this.segmentManager.destroy();
    }
    getSettings() {
        return {
            segments: this.segmentManager.getSettings(),
            loader: this.loader.getSettings()
        };
    }
    getDetails() {
        return {
            loader: this.loader.getDetails()
        };
    }
    initShakaPlayer(player) {
        integration.initShakaPlayer(player, this.segmentManager);
    }
}
exports.Engine = Engine;

},{"./integration":3,"./segment-manager":6,"events":"events","p2p-media-loader-core":"p2p-media-loader-core"}],3:[function(require,module,exports){
"use strict";
/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Debug = require("debug");
const manifest_parser_proxy_1 = require("./manifest-parser-proxy");
const utils_1 = require("./utils");
const debug = Debug("p2pml:shaka:index");
function initShakaPlayer(player, segmentManager) {
    registerParserProxies();
    initializeNetworkingEngine();
    let intervalId = 0;
    let lastPlayheadTimeReported = 0;
    player.addEventListener("loading", () => {
        if (intervalId > 0) {
            clearInterval(intervalId);
            intervalId = 0;
        }
        lastPlayheadTimeReported = 0;
        const manifest = player.getManifest();
        if (manifest && manifest.p2pml) {
            manifest.p2pml.parser.reset();
        }
        segmentManager.destroy();
        intervalId = setInterval(() => {
            const time = getPlayheadTime(player);
            if (time !== lastPlayheadTimeReported || player.isBuffering()) {
                segmentManager.setPlayheadTime(time);
                lastPlayheadTimeReported = time;
            }
        }, 500);
    });
    debug("register request filter");
    player.getNetworkingEngine().registerRequestFilter((requestType, request) => {
        request.p2pml = { player, segmentManager };
    });
}
exports.initShakaPlayer = initShakaPlayer;
function registerParserProxies() {
    debug("register parser proxies");
    shaka.media.ManifestParser.registerParserByExtension("mpd", manifest_parser_proxy_1.ShakaDashManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/dash+xml", manifest_parser_proxy_1.ShakaDashManifestParserProxy);
    shaka.media.ManifestParser.registerParserByExtension("m3u8", manifest_parser_proxy_1.ShakaHlsManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/x-mpegurl", manifest_parser_proxy_1.ShakaHlsManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/vnd.apple.mpegurl", manifest_parser_proxy_1.ShakaHlsManifestParserProxy);
}
function initializeNetworkingEngine() {
    debug("init networking engine");
    shaka.net.NetworkingEngine.registerScheme("http", processNetworkRequest);
    shaka.net.NetworkingEngine.registerScheme("https", processNetworkRequest);
}
function processNetworkRequest(uri, request, requestType) {
    if (!request.p2pml || requestType !== shaka.net.NetworkingEngine.RequestType.SEGMENT) {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }
    const { player, segmentManager } = request.p2pml;
    const mapRangeHeaderToQuery = segmentManager.getSettings().mapRangeHeaderToQuery;
    const manifest = player.getManifest();
    if (!manifest || !manifest.p2pml) {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }
    const parser = manifest.p2pml.parser;
    const segment = parser.find(uri, request.headers.Range);
    if (!segment || segment.streamType !== "video") {
        if (mapRangeHeaderToQuery !== undefined) {
            let range = undefined;
            if (request.headers.Range) {
                range = request.headers.Range.slice(6).split('-');
                delete request.headers.Range;
            }
            else if (request.headers.range) {
                range = request.headers.range.slice(6).split('-');
                delete request.headers.range;
            }
            if (range !== undefined) {
                uri += (uri.includes('?') ? '&' : '?') + mapRangeHeaderToQuery.startKey + '=' + range[0] + '&' + mapRangeHeaderToQuery.endKey + '=' + range[1];
                return shaka.net.HttpXHRPlugin(uri, request, requestType);
            }
            else {
                return shaka.net.HttpXHRPlugin(uri, request, requestType);
            }
        }
        else {
            return shaka.net.HttpXHRPlugin(uri, request, requestType);
        }
    }
    debug("request", "load", segment.identity);
    const promise = segmentManager.load(segment, utils_1.getSchemedUri(player.getManifestUri()), getPlayheadTime(player));
    const abort = () => __awaiter(this, void 0, void 0, function* () {
        debug("request", "abort", segment.identity);
        // TODO: implement abort in SegmentManager
    });
    return new shaka.util.AbortableOperation(promise, abort);
}
function getPlayheadTime(player) {
    let time = 0;
    const date = player.getPlayheadTimeAsDate();
    if (date) {
        time = date.valueOf();
        if (player.isLive()) {
            time -= player.getPresentationStartTimeAsDate().valueOf();
        }
        time /= 1000;
    }
    return time;
}

},{"./manifest-parser-proxy":4,"./utils":7,"debug":"debug"}],4:[function(require,module,exports){
"use strict";
/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const parser_segment_1 = require("./parser-segment");
class ShakaManifestParserProxy {
    constructor(originalManifestParser) {
        this.cache = new parser_segment_1.ParserSegmentCache(200);
        this.originalManifestParser = originalManifestParser;
    }
    isHls() { return this.originalManifestParser instanceof shaka.hls.HlsParser; }
    isDash() { return this.originalManifestParser instanceof shaka.dash.DashParser; }
    start(uri, playerInterface) {
        return this.originalManifestParser.start(uri, playerInterface).then((manifest) => {
            this.manifest = manifest;
            for (const period of manifest.periods) {
                const processedStreams = [];
                for (const variant of period.variants) {
                    if ((variant.video != null) && (processedStreams.indexOf(variant.video) == -1)) {
                        this.hookGetSegmentReference(variant.video);
                        processedStreams.push(variant.video);
                    }
                    if ((variant.audio != null) && (processedStreams.indexOf(variant.audio) == -1)) {
                        this.hookGetSegmentReference(variant.audio);
                        processedStreams.push(variant.audio);
                    }
                }
            }
            manifest.p2pml = { parser: this };
            return manifest;
        });
    }
    configure(config) {
        return this.originalManifestParser.configure(config);
    }
    stop() {
        return this.originalManifestParser.stop();
    }
    update() {
        return this.originalManifestParser.update();
    }
    onExpirationUpdated() {
        return this.originalManifestParser.onExpirationUpdated();
    }
    find(uri, range) {
        return this.cache.find(uri, range);
    }
    reset() {
        this.cache.clear();
    }
    hookGetSegmentReference(stream) {
        stream.getSegmentReferenceOriginal = stream.getSegmentReference;
        stream.getSegmentReference = (number) => {
            this.cache.add(stream, number);
            return stream.getSegmentReferenceOriginal(number);
        };
        stream.getPosition = () => {
            if (this.isHls()) {
                if (stream.type === "video") {
                    return this.manifest.periods[0].variants.reduce((a, i) => {
                        if (i.video && i.video.id && !a.includes(i.video.id)) {
                            a.push(i.video.id);
                        }
                        return a;
                    }, []).indexOf(stream.id);
                }
            }
            return -1;
        };
    }
} // end of ShakaManifestParserProxy
exports.ShakaManifestParserProxy = ShakaManifestParserProxy;
class ShakaDashManifestParserProxy extends ShakaManifestParserProxy {
    constructor() {
        super(new shaka.dash.DashParser());
    }
}
exports.ShakaDashManifestParserProxy = ShakaDashManifestParserProxy;
class ShakaHlsManifestParserProxy extends ShakaManifestParserProxy {
    constructor() {
        super(new shaka.hls.HlsParser());
    }
}
exports.ShakaHlsManifestParserProxy = ShakaHlsManifestParserProxy;

},{"./parser-segment":5}],5:[function(require,module,exports){
"use strict";
/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
class ParserSegment {
    constructor(streamId, streamType, streamPosition, streamIdentity, identity, position, start, end, uri, range, prev, next) {
        this.streamId = streamId;
        this.streamType = streamType;
        this.streamPosition = streamPosition;
        this.streamIdentity = streamIdentity;
        this.identity = identity;
        this.position = position;
        this.start = start;
        this.end = end;
        this.uri = uri;
        this.range = range;
        this.prev = prev;
        this.next = next;
    }
    static create(stream, position) {
        const ref = stream.getSegmentReferenceOriginal(position);
        if (!ref) {
            return undefined;
        }
        const uris = ref.createUris();
        if (!uris || uris.length === 0) {
            return undefined;
        }
        const start = ref.getStartTime();
        const end = ref.getEndTime();
        const startByte = ref.getStartByte();
        const endByte = ref.getEndByte();
        const range = startByte || endByte
            ? `bytes=${startByte || ""}-${endByte || ""}`
            : undefined;
        const streamTypeCode = stream.type.substring(0, 1).toUpperCase();
        const streamPosition = stream.getPosition();
        const streamIsHls = streamPosition >= 0;
        const streamIdentity = streamIsHls
            ? `${streamTypeCode}${streamPosition}`
            : `${streamTypeCode}${stream.id}`;
        const identity = streamIsHls
            ? `${streamIdentity}+${position}`
            : `${streamIdentity}+${Number(start).toFixed(3)}`;
        return new ParserSegment(stream.id, stream.type, streamPosition, streamIdentity, identity, position, start, end, utils_1.getSchemedUri(uris[0]), range, () => ParserSegment.create(stream, position - 1), () => ParserSegment.create(stream, position + 1));
    }
} // end of ParserSegment
exports.ParserSegment = ParserSegment;
class ParserSegmentCache {
    constructor(maxSegments) {
        this.segments = [];
        this.maxSegments = maxSegments;
    }
    find(uri, range) {
        return this.segments.find(i => i.uri === uri && i.range === range);
    }
    add(stream, position) {
        const segment = ParserSegment.create(stream, position);
        if (segment && !this.find(segment.uri, segment.range)) {
            this.segments.push(segment);
            if (this.segments.length > this.maxSegments) {
                this.segments.splice(0, this.maxSegments * 0.2);
            }
        }
    }
    clear() {
        this.segments.splice(0);
    }
} // end of ParserSegmentCache
exports.ParserSegmentCache = ParserSegmentCache;

},{"./utils":7}],6:[function(require,module,exports){
"use strict";
/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Debug = require("debug");
const p2p_media_loader_core_1 = require("p2p-media-loader-core");
const defaultSettings = {
    forwardSegmentCount: 20,
    maxHistorySegments: 50,
    swarmId: undefined,
    mapRangeHeaderToQuery: undefined,
};
class SegmentManager {
    constructor(loader, settings = {}) {
        this.debug = Debug("p2pml:shaka:sm");
        this.requests = new Map();
        this.manifestUri = "";
        this.playheadTime = 0;
        this.segmentHistory = [];
        this.onSegmentLoaded = (segment) => {
            if (this.requests.has(segment.id)) {
                this.reportSuccess(this.requests.get(segment.id), segment);
                this.debug("request delete", segment.id);
                this.requests.delete(segment.id);
            }
        };
        this.onSegmentError = (segment, error) => {
            if (this.requests.has(segment.id)) {
                this.reportError(this.requests.get(segment.id), error);
                this.debug("request delete from error", segment.id);
                this.requests.delete(segment.id);
            }
        };
        this.onSegmentAbort = (segment) => {
            if (this.requests.has(segment.id)) {
                this.reportError(this.requests.get(segment.id), "Internal abort");
                this.debug("request delete from abort", segment.id);
                this.requests.delete(segment.id);
            }
        };
        this.settings = Object.assign({}, defaultSettings, settings);
        this.loader = loader;
        this.loader.on(p2p_media_loader_core_1.Events.SegmentLoaded, this.onSegmentLoaded);
        this.loader.on(p2p_media_loader_core_1.Events.SegmentError, this.onSegmentError);
        this.loader.on(p2p_media_loader_core_1.Events.SegmentAbort, this.onSegmentAbort);
    }
    destroy() {
        if (this.requests.size !== 0) {
            console.error("Destroying segment manager with active request(s)!");
            this.requests.clear();
        }
        this.playheadTime = 0;
        this.segmentHistory.splice(0);
        this.loader.destroy();
    }
    getSettings() {
        return this.settings;
    }
    load(parserSegment, manifestUri, playheadTime) {
        return __awaiter(this, void 0, void 0, function* () {
            this.manifestUri = manifestUri;
            this.playheadTime = playheadTime;
            this.pushSegmentHistory(parserSegment);
            const lastRequestedSegment = this.refreshLoad();
            const alreadyLoadedSegment = this.loader.getSegment(lastRequestedSegment.id);
            return new Promise((resolve, reject) => {
                const request = new Request(lastRequestedSegment.id, resolve, reject);
                if (alreadyLoadedSegment) {
                    this.reportSuccess(request, alreadyLoadedSegment);
                }
                else {
                    this.debug("request add", request.id);
                    this.requests.set(request.id, request);
                }
            });
        });
    }
    setPlayheadTime(time) {
        this.playheadTime = time;
        if (this.segmentHistory.length > 0) {
            this.refreshLoad();
        }
    }
    refreshLoad() {
        const lastRequestedSegment = this.segmentHistory[this.segmentHistory.length - 1];
        const safePlayheadTime = this.playheadTime > 0.1 ? this.playheadTime : lastRequestedSegment.start;
        const sequence = this.segmentHistory.reduce((a, i) => {
            if (i.start >= safePlayheadTime) {
                a.push(i);
            }
            return a;
        }, []);
        if (sequence.length === 0) {
            sequence.push(lastRequestedSegment);
        }
        const lastRequestedSegmentIndex = sequence.length - 1;
        do {
            const next = sequence[sequence.length - 1].next();
            if (next) {
                sequence.push(next);
            }
            else {
                break;
            }
        } while (sequence.length < this.settings.forwardSegmentCount);
        const masterSwarmId = (this.settings.swarmId && (this.settings.swarmId.length !== 0)) ?
            this.settings.swarmId : this.manifestUri.split("?")[0];
        const loaderSegments = sequence.map((s, i) => {
            return new p2p_media_loader_core_1.Segment(`${masterSwarmId}+${s.identity}`, s.uri, s.range, i);
        });
        this.loader.load(loaderSegments, `${masterSwarmId}+${lastRequestedSegment.streamIdentity}`);
        return loaderSegments[lastRequestedSegmentIndex];
    }
    pushSegmentHistory(segment) {
        if (this.segmentHistory.length >= this.settings.maxHistorySegments) {
            this.debug("segment history auto shrink");
            this.segmentHistory.splice(0, this.settings.maxHistorySegments * 0.2);
        }
        if (this.segmentHistory.length > 0 && this.segmentHistory[this.segmentHistory.length - 1].start > segment.start) {
            this.debug("segment history reset due to playhead seek back");
            this.segmentHistory.splice(0);
        }
        this.segmentHistory.push(segment);
    }
    reportSuccess(request, loaderSegment) {
        let timeMs = undefined;
        if (loaderSegment.downloadSpeed > 0 && loaderSegment.data && loaderSegment.data.byteLength > 0) {
            timeMs = Math.trunc(loaderSegment.data.byteLength / loaderSegment.downloadSpeed);
        }
        this.debug("report success", request.id);
        request.resolve({ data: loaderSegment.data, timeMs });
    }
    reportError(request, error) {
        if (request.reject) {
            this.debug("report error", request.id);
            request.reject(error);
        }
    }
} // end of SegmentManager
exports.SegmentManager = SegmentManager;
class Request {
    constructor(id, resolve, reject) {
        this.id = id;
        this.resolve = resolve;
        this.reject = reject;
    }
}

},{"debug":"debug","p2p-media-loader-core":"p2p-media-loader-core"}],7:[function(require,module,exports){
"use strict";
/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
function getSchemedUri(uri) {
    return uri.startsWith("//") ? window.location.protocol + uri : uri;
}
exports.getSchemedUri = getSchemedUri;

},{}],"p2p-media-loader-shaka":[function(require,module,exports){
"use strict";
/**
 * @license Apache-2.0
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var engine_1 = require("./engine");
exports.Engine = engine_1.Engine;
exports.version = typeof (__P2PML_VERSION__) === "undefined" ? "0.5.0" : __P2PML_VERSION__;

},{"./engine":2}]},{},[1]);
