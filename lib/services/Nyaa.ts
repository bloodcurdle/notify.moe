import { AnimeReleaseNotifier } from '../'
import { Anime } from '../interfaces/Anime'
import * as bluebird from 'bluebird'
import * as xml2js from 'xml2js'

let NodeCache = require('node-cache')
let watch = require('node-watch')

declare var arn: AnimeReleaseNotifier

function pad(pad, str, padLeft) {
	if(str === undefined)
		return pad

	if(str.length >= pad.length)
		return str

	if(padLeft)
		return (pad + str).slice(-pad.length)

	return (str + pad).substring(0, pad.length)
}

class Nyaa {
	headers = {
		'User-Agent': 'Anime Release Notifier'
	}

	xmlParser = new xml2js.Parser({
		explicitArray: false,
		ignoreAttrs: true,
		trim: true,
		normalize: true,
		explicitRoot: false,
		strict: true
	})

	episodeRegEx = /[ _]-[ _](\d{2,3})(?:v\d)?[ _][\(\[-]/
	batchRegEx = /[^h\d]\d{2,3}-(\d{2,3})[^p\d]/

	cache = new NodeCache({
		stdTTL: 20 * 60
	})

	constructor() {
		bluebird.promisifyAll(this.cache)
		bluebird.promisifyAll(this.xmlParser)
	}

	async getAnimeInfo(anime: Anime) {
		let searchTitle = await arn.db.get('AnimeToNyaa', anime.id).then(match => {
			return match.title
		}).catch(error => {
			let tmpTitle = this.buildNyaaTitle(anime.title.romaji)

			// Save in database
			if(tmpTitle) {
				arn.db.set('AnimeToNyaa', anime.id, {
					id: anime.id,
					title: tmpTitle
				})
			}

			return tmpTitle
		})

		searchTitle = searchTitle.replace(/ /g, '+')

		let quality = ''
		let subs = ''
		let nyaaSuffix = `&cats=1_37&filter=0&sort=2&term=${searchTitle}+${quality}+${subs}`.replace(/\+\+/g, '+').replace(/^\++|\++$/g, '')

		let nyaa = {
			url: `https://www.nyaa.se/?page=search${nyaaSuffix}`,
			rssUrl: `https://www.nyaa.se/?page=rss${nyaaSuffix}`,
			available: 0,
			type: 'download'
		}

		// Next episode
		let addItemInfo = (nyaa, item) => {
			nyaa.available = item.episodes
			nyaa.isBatch = item.isBatch

			if(!item.isBatch && anime.episodes && anime.episodes.next !== undefined) {
				nyaa.nextEpisode = {
					url: nyaa.url + '+' + pad('00', anime.episodes.next.toString(), true)
				}
			}

			return nyaa
		}

		let cacheKey = `${searchTitle}:${quality}:${subs}`

		await this.cache.getAsync(cacheKey).then(item => {
			if(item) {
				return addItemInfo(nyaa, item)
			}

			return request({
				uri: nyaa.rssUrl,
				method: 'GET',
				headers: this.headers
			}).then(rss => {
				return this.getItemWithMostEpisodes(rss, anime, cacheKey).then(item => {
					addItemInfo(nyaa, item)
				})
			}).catch(error => {
				if(error.name === 'StatusCodeError') {
					console.warn(`Unavailable [${error.statusCode}]: ${error.options.uri}`)
					return
				}

				console.error(error)
			})
		}).catch(error => {
			console.error(error)
		})

		return nyaa
	}

	buildNyaaTitle(title) {
		if(!title)
			return title

		if(!title.replace)
			console.error(title)

		title = title.replace(/[^[:alnum:]!']/gi, ' ')
		title = title.replace(/ \(?TV\)?/g, '')
		title = title.replace(/  /g, ' ')
		title = title.trim()
		return title
	}

	getItemWithMostEpisodes(rssResponse, anime, cacheKey) {
		let highestItem = {
			episodes: 0,
			isBatch: 0
		}

		return this.xmlParser.parseStringAsync(rssResponse).then(json => {
			if(Array.isArray(json.channel.item)) {
				// Get highest episode number
				let items = json.channel.item.map(item => {
					let match = this.episodeRegEx.exec(item.title)

					if(match !== null) {
						return {
							episodes: parseInt(match[1]),
							isBatch: 0
						}
					}

					match = this.batchRegEx.exec(item.title)

					if(match !== null) {
						return {
							episodes: parseInt(match[1]),
							isBatch: 1
						}
					}

					return null
				})

				items.forEach(item => {
					if(!item)
						return

					if(item.isBatch) {
						if(highestItem.isBatch) {
							if(item.episodes > highestItem.episodes) {
								highestItem = item
							}
						} else {
							if(highestItem.episodes === 0) {
								highestItem = item
							}
						}
					} else {
						if(item.episodes > highestItem.episodes) {
							highestItem = item
						}
					}
				})
			}

			this.cache.set(cacheKey, highestItem, (error, success) => error)

			// Save available count in database
			arn.db.set('AnimeToNyaa', anime.id, highestItem)

			return highestItem
		}).catch(error => {
			console.error(error)
			return bluebird.resolve(highestItem)
		})
	}
}

module.exports = new Nyaa()