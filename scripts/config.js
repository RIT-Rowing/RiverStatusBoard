import { APIClientIdentifier, DatapointIdentifier } from './constants.js';
import { toCelsius, validateNumber } from './helpers.js';
export class RiverStatusConfig {
	
	constructor({riverName, clubFullName, clubAcronym, boathouseLat, boathouseLong, safetyMatrix, dataSources }) {
		this.riverName = riverName;
		this.clubFullName = clubFullName;
		this.clubAcronym = clubAcronym;
		this.boathouseLat = boathouseLat;
		this.boathouseLong = boathouseLong;
		this.dataSources = dataSources;
		this.safetyMatrix = safetyMatrix; //TODO: make optional
	}

	/**
	 * return the list of data sources for this configuration showing only those of a specific type
	 * @param {*} type the [APIClientIdentifier] of the data source to filter for
	 * @returns a filtered list of data sources showing only those belonging to the specified data source
	 */
	getDataSourceDetailsByType(type) {
		return this.dataSources.filter((src) => src.type === type);
	}

	/**
	 * return the list of data sources for this configuration showing only those containing a particular purpose hint
	 * @param {*} purpose the [DatatypeIdentifer] indicating the data points to filter for
	 * @returns a filtered list of data sources showing only those containing the specific datapoint hint
	 */
	//TODO: support optional purposeHints and allow for trying each data source matching the right type to see if it has the data or not
	getDataSourceDetailsByPurpose(purpose) {
		return this.dataSources.filter((src) => src.purposeHints.includes(purpose));
	}

	/**
	 * filter data sources by both type and purpose
	 * @param {*} type 
	 * @param {*} purpose 
	 * @returns 
	 */
	getDataSourceDetails(type, purpose) {
		if (type === undefined) {
			return this.getDataSourceDetailsByPurpose(purpose)
		} else if (purpose === undefined) {
			return this.getDataSourceDetailsByType(type)
		} else {
			let typematch_sources = this.getDataSourceDetailsByType(type)

			let results = typematch_sources.filter((src) => src.purposeHints.includes(purpose));

			if (results.length >= 1) {
				return results
			} else {
				return typematch_sources
			}
		}
	}
}

class Conditional {

	constructor(conditions) {
		/**
		 * The conditions under which this class or any derived subclasses applies
		 * These will be checked in order. The last one that has a match with any current conditions will be used
		 */
		this.conditions = conditions;
	}


	/**
	 * determines whether this safety zones criteria are met by the given input data
	 * 
	 * a zones criteria are met if any current value is above the threshold defined in the zone
	 * 
	 * @param {*} values an object containing every possible datapoint identifier
	 * (as keys of an object) and their current values
	 * 
	 * @returns boolean indicating whether or not this zones criteria are met 
	 */
	isTriggeredBy(values){
		if (typeof(this.conditions) === 'undefined' || this.conditions.length == 0){
			return true
		}
		return Array.from(this.conditions).map((condition) => condition.evaluate(values[condition.datapointId])).some((v) => v);
	}
}

/**
 * Represents a textual summary of what limitations are in place when in this safety zone
 */
export class Restriction extends Conditional {

	constructor({category, description, conditions = undefined}) {
		super(conditions)
		this.category = category;
		if (typeof(description) === 'string') {
			this.description = [description]
		} else {
			this.description = description;
		}
	}

	get hasCategory() {
		return typeof(this.category) !== 'undefined' && this.category !== "";
	}

	get htmlDescription() {
		return this.description.join();
	}
}


/**
 * Represents set of conditions based on a range of values for a specific data point.
 * Used to determine the current safety zone
 */
export class Condition {

	constructor(datapointId, {min, max, unit}) {
		this.datapointId = datapointId;
		this.unit = unit;

		const hasMax = validateNumber(max);
		const hasMin = validateNumber(min);  

		if (!hasMax && !hasMin){
			throw new Error("Condition with no values cannot be evaluated")
		} else if (!hasMax || !hasMin) {
			// one value is not valid
			this.lowerBound = hasMin? Number(min) : undefined;
			this.upperBound = hasMax? Number(max) : undefined;
		} else {
			min = Number(min);
			max = Number(max);

			// regardless of the order they are entered, ensure the largest number is the upperBound
			this.lowerBound = Math.min(min, max);
			this.upperBound = Math.max(min, max);
		}
	}

	evaluate(value) {
		const atLeast = this.lowerBound ? value >= this.lowerBound: true;
		const notBeyond = this.upperBound ? value < this.upperBound : true;

		return atLeast && notBeyond;
	}
}

export class LessThan extends Condition {
	constructor(datapointId, max, unit = undefined) {
		super(datapointId, {max, unit})
	}
}

export class AtLeast extends Condition {
	constructor(datapointId, min, unit = undefined) {
		super(datapointId, {min, unit})
	}
}
export const GreaterThan = AtLeast;

export class Between extends Condition {
	constructor(datapointId, min, max, unit = undefined) {
		super(datapointId, {min, max, unit})
	}
}

/**
 * A safety zone has a value (intended to be displayed as a single character)
 * and a color, and also probably some notion of being ordered
 * 
 * its core data structure is a list of zones which itself contains a mapping
 * of datapoint identifiers to threshold values 
 */
export class SafetyZone extends Conditional {

	get UNKNOWN() {
		return new SafetyZone({label: "?", color: 'gray'})
	}

	/**
	 * 
	 * @param {*} label the value displayed to the user when in this zone. Should be one effective character (letter, number, symbol, emoji, etc) 
	 * @param {*} color  the color this zone will show as (background for the label)
	 * @param {*} conditions The conditions under which this safety zone is active
	 * @param {*} restrictions Restriction objects describing limitations of this zone
	 */
	constructor({label, color="gray", conditions=[], restrictions=[]}) {
		super(conditions)
		this.label = label;
		this.color = color;

		/** list of objects representing textual descriptions of limitations on
		 * rowing when in this zone applies */
		this.restrictions = restrictions
	}

	getRestrictionsForData(values) {
		return this.restrictions.filter((r) => r.isTriggeredBy(values))
	}
}




/**
 * This is a configuration object that should be able to represent many variations of the safety matrix concept
 * it allows values for different data fields (identified by [DatapointIdentifier] enum values) to be mapped to any number of safety zones (identified by arbitrary symbols and colors that are shown to users)
 */
export class SafetyMatrix {

	constructor({safetyZones, unsafeZone, version, source}) {
		/**
		 * ordered list of SafetyZones, safest to least safe
		 */
		this.safetyZones = safetyZones
		this.unsafeZone = unsafeZone
		this.version = version
		this.source = source

		// TODO: place to store optional link to view the clubs underlying safety matrix document

	}

	/**
	 * provides the safety zone that applies according to the given input data
	 * @param {*} data an object containing every possible datapoint identifier
	 * as its keys and containing their current values
	 * 
	 * @returns the current SafetyZone that applies given the current data
	 */
	getZoneForData(data) {
		if (!this.safetyZones) {
			return SafetyZone.UNKNOWN;
		}

		// add the unsafezone to the end of the list when evaluating
		let zones = Array.from(this.safetyZones);
		if (this.unsafeZone){
			zones.push(this.unsafeZone);
		}

		var selectedZone = SafetyZone.UNKNOWN;

		for (const zone of zones) {
			if (zone.isTriggeredBy(data)) {
				selectedZone = zone;
			} else {
				continue
			}
		}
		return selectedZone;
	}
	
}

let ritconfig = new RiverStatusConfig({
	riverName: "Genesee",
	clubFullName: "RIT Rowing",
	clubAcronym: "RIT",
	boathouseLat: 43.064251,
	boathouseLong: -77.699065,
	safetyMatrix: new SafetyMatrix({
		version: "RIT Safety Matrix (August 14th, 2025 version)",
		safetyZones: [
			new SafetyZone({
				label: '1',
				color: '#00c020',
				conditions: [
					new LessThan(DatapointIdentifier.WATER_FLOW, 3, "kcfs"),
					new AtLeast(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "All Boats"
					}),
					new Restriction({
						category: 'Racing',
						description: "Racing Allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "Shells must be accompanied by one launch"
					}),
					
					new Restriction({
						category: 'Safety Gear',
						description: "<p><b>Rowers</b>: PFD not required</p>" +
							"<p><b>Coxswains</b>: PFD not required</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>No restrictions</p>"
					})
				]
			}),
			new SafetyZone({
				label: '2',
				color: '#40fe00',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 3, 5, "kcfs"),
					new AtLeast(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "All Boats"
					}),
					new Restriction({
						category: 'Racing',
						description: "Racing Allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per 3 shells"
					}),
					
					new Restriction({
						category: 'Safety Gear',
						description: "<p><b>Rowers</b>: PFD not required</p>" +
							"<p><b>Coxswains</b>: PFD not required</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>No Learn to Rows</p>"
					})
				]
			}),
			new SafetyZone({
				label: '3',
				color: '#ffff00',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 5, 7, "kcfs"),
					new Between(DatapointIdentifier.WATER_TEMP, toCelsius(45), toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4x, 4+, 2x",
						conditions: [
							new LessThan(DatapointIdentifier.WATER_FLOW, 5, "kcfs")
						]
					}),
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4x, 4+",
						conditions: [
							new AtLeast(DatapointIdentifier.WATER_FLOW, 5, "kcfs")
						]
					}),
					new Restriction({
						category: 'Racing',
						description: "Racing Allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per 2 shells"
					}),
					
					new Restriction({
						category: 'Safety Gear',
						description: "<p><b>Rowers</b>: PFD Required unless launch to shell ratio 1:1</p>" +
							"<p><b>Coxswains</b>: PFD Required</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>No Learn to Rows</p>"
					})
				]
			}),
			new SafetyZone({
				label: '4',
				color: '#ffa800',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 7, 10, "kcfs"),
					new Between(DatapointIdentifier.WATER_TEMP, toCelsius(45), toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4x, 4+",
						conditions: [
							new LessThan(DatapointIdentifier.WATER_FLOW, 5, "kcfs")
						]
					}),
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4x",
						conditions: [
							new AtLeast(DatapointIdentifier.WATER_FLOW, 5, "kcfs")
						]
					}),
					new Restriction({
						category: 'Racing',
						description: "No racing allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per shell"
					}),
					new Restriction({
						category: 'Safety Gear',
						description: "<p><b>Rowers</b>: PFD Required</p>" +
							"<p><b>Coxswains</b>: PFD Required</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>No New Novices</p>"
					})
				]
			}),
			new SafetyZone({
				label: '5',
				color: '#ff0000',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 10, 12, "kcfs"),
					new Between(DatapointIdentifier.WATER_TEMP, toCelsius(35), toCelsius(45), "F"),
					new Between(DatapointIdentifier.AIR_QUALITY, 150, 200, "AQI")
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4x",
					}),
					new Restriction({
						category: 'Racing',
						description: "No racing allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per shell"
					}),
					new Restriction({
						category: 'Safety Gear',
						description: "<p><b>Rowers</b>: PFD Required</p>" +
							"<p><b>Coxswains</b>: PFD Required</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>No Novices</p>"
					})
				]
			})
		],
		unsafeZone: new SafetyZone({
			label: '☠️',
			color: '#000000',
			conditions: [
				new AtLeast(DatapointIdentifier.WATER_FLOW, 12, "kcfs"),
				new LessThan(DatapointIdentifier.WATER_TEMP, toCelsius(35), "F"),
				new AtLeast(DatapointIdentifier.AIR_QUALITY, 200, "AQI")
			],
			restrictions: [
				new Restriction({
					category: 'Additional Info',
					description: "Water use not allowed."
				})
			]
		})
	}),
	dataSources: [
		{
			type: APIClientIdentifier.USGS,
			id: "04230650",
			purposeHints: [DatapointIdentifier.WATER_FLOW],
			comment: "Jefferson Bridge"
		},
		{
			type: APIClientIdentifier.USGS,
			id: "04231600",
			purposeHints: [DatapointIdentifier.WATER_TEMP],
			comment: "Ford St. Bridge"
		},
		{
			type: APIClientIdentifier.NOAA_WATER,
			id: "blbn6",
			purposeHints: [DatapointIdentifier.WATER_LEVEL],
			comment: "Jefferson Road Bridge"
		},
		{
			type: APIClientIdentifier.NOAA_W1,
			id: "KROC",
			purposeHints: [DatapointIdentifier.AIR_TEMP, DatapointIdentifier.AIR_SPEED, DatapointIdentifier.AIR_DIRECTION],
			comment: "Greater Rochester International Airport"
		},
		{
			type: APIClientIdentifier.AIRNOW,
			id: "Eastern_Lake_Ontario_Region_NY",
			purposeHints: [DatapointIdentifier.AIR_QUALITY],
			friendlyPage: "https://www.airnow.gov/?city=Rochester&state=NY&country=USA",
			comment: "Eastern Lake Ontario Region"
		},
	]
});

let trraconfig = new RiverStatusConfig({
	riverName: "Allegheny",
	clubFullName: "Three Rivers Rowing Association",
	clubAcronym: "TRRA",
	boathouseLat: 40.466846,
	boathouseLong: -79.976543,
	safetyMatrix: new SafetyMatrix({
		version: "2024 Rowing Matrix: Revised May 2024 by TRRA Safety Committee and accepted by TRRA Board",
		source: "https://www.threeriversrowing.org/_files/ugd/e46300_61356ec9d051465e9e9bd249ff77e3b4.pdf",
		safetyZones: [
			new SafetyZone({
				label: '1',
				color: '#00c020',
				conditions: [
					new LessThan(DatapointIdentifier.WATER_FLOW, 30, "kcfs"),
					new AtLeast(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "All boats"
					}),
					new Restriction({
						category: 'Racing',
						description: "Racing allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "Not Required. See Appendix #5 for U18/HS"
					}),
					new Restriction({
						category: 'Certification',
						description: "TRRA-Equivalent Certification"
					}),
					new Restriction({
						category: 'PFDs',
						description: "<p><b>Rowers</b>: PFD not required</p>" +
							"<p><b>Coxswains</b>: PFD Required to be worn from November 1st through April 30th</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Comms',
						description: "A whistle is <i>required</i> and protected cell phone recommended in each launch or in each shell not accompanied by a launch"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>U14: approved</p>" +
							"<p>Novice: approved</p>" +
							"<p>Experienced: approved</p>" +
							"<p>Adaptive: approved</p>"
					})
				]
			}),
			new SafetyZone({
				label: '2',
				color: '#40fe00',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 30, 40, "kcfs"),
					new AtLeast(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "<p>Racing shells: All types</p>" +
						"<p>Adaptive shells: All boats</p>"
					}),
					new Restriction({
						category: 'Racing',
						description: "Racing allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per 3 shells"
					}),
					new Restriction({
						category: 'Certification',
						description: "TRRA-Equivalent Certification"
					}),
					new Restriction({
						category: 'PFDs',
						description: "<p><b>Rowers</b>: PFD Recommended to be worn or in shell for 1x, 2x, 2-</p>" +
							"<p><b>Coxswains</b>: PFD Required to be worn from November 1st through April 30th</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Comms',
						description: "Protected cell phone and whistle <i>required</i> in each launch <i>and</i> recommended in each shell"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>U14: restricted</p>" +
							"<p>Novice: approved</p>" +
							"<p>Experienced: approved</p>" +
							"<p>Adaptive: approved</p>"
					})
				]
			}),
			new SafetyZone({
				label: '3',
				color: '#c8ff00',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 40, 45, "kcfs"),
					new LessThan(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4+, 4x, 4-, 2x",
						conditions: [
							new LessThan(DatapointIdentifier.WATER_FLOW, 40, "kcfs")
						]
					}),
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4+, 4x, 4-",
						conditions: [
							new AtLeast(DatapointIdentifier.WATER_FLOW, 40, "kcfs")
						]
					}),
					new Restriction({
						category: 'Racing',
						description: "No racing allowed (see appendix #6)"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per 2 shells"
					}),
					new Restriction({
						category: 'Certification',
						description: "TRRA-Equivalent Certification"
					}),
					new Restriction({
						category: 'PFDs',
						description: "<p><b>Rowers</b>: PFD Recommended to be worn or in shell for all rowers</p>" +
							"<p><b>Coxswains</b>: PFD Required to be worn from November 1st through April 30th</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>"
					}),
					new Restriction({
						category: 'Comms',
						description: "Protected cell phone and whistle <i>required</i> in each launch <i>and</i> recommended in each shell"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>U14: restricted</p>" +
							"<p>Novice: limited*</p>" +
							"<p>Experienced: approved</p>" +
							"<p>Adaptive: inclusion</p>"
					})
				]
			}),
			new SafetyZone({
				label: '4',
				color: '#ffff00',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 45, 50, "kcfs"),
					new LessThan(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4+, 4x",
					}),
					new Restriction({
						category: 'Racing',
						description: "No racing allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per shell"
					}),
					new Restriction({
						category: 'Certification',
						description: "TRRA-Equivalent Certification"
					}),
					new Restriction({
						category: 'PFDs',
						description: "<p><b>Rowers</b>: PFD Recommended to be worn or in shell at all times (see appendix #7)</p>" +
							"<p><b>Coxswains</b>: PFD Required to be worn from November 1st through April 30th</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>",
						conditions: [
							new GreaterThan(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F")
						]
					}),
					new Restriction({
						category: 'PFDs',
						description: "<p><b>Rowers</b>: PFD Required to be worn by all rowers</p>" +
							"<p><b>Coxswains</b>: PFD Required to be worn from November 1st through April 30th</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>",
						conditions: [
							new LessThan(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F")
						]
					}),
					new Restriction({
						category: 'Comms',
						description: "Protected cell phone and whistle <i>required</i> in each launch <i>and</i> recommended in each shell"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>U14: restricted</p>" +
							"<p>Novice: limited*</p>" +
							"<p>Experienced: approved</p>" +
							"<p>Adaptive: inclusion</p>"
					})
				]
			}),
			new SafetyZone({
				label: '5',
				color: '#ffa800',
				conditions: [
					new Between(DatapointIdentifier.WATER_FLOW, 50, 60, "kcfs"),
					new LessThan(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F"),
				],
				restrictions: [
					new Restriction({
						category: 'Shell Types',
						description: "8+, 4x",
					}),
					new Restriction({
						category: 'Racing',
						description: "No racing allowed"
					}),
					new Restriction({
						category: 'Launches',
						description: "1 launch per shell and sufficient launches to:<br>" + 
						"(a) carry all rowers and coxes participating in the session<br>" +
						"(b) have at least 2 engines between all launches on the water (towing line required)"
					}),
					new Restriction({
						category: 'Certification',
						description: "TRRA-Equivalent Certification"
					}),
					new Restriction({
						category: 'PFDs',
						description: "<p><b>Rowers</b>: PFD Recommended to be worn or in shell at all times</p>" +
							"<p><b>Coxswains</b>: PFD Required to be worn from November 1st through April 30th</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>",
						conditions: [
							new GreaterThan(DatapointIdentifier.WATER_TEMP, toCelsius(50), "F")
						]
					}),
					new Restriction({
						category: 'PFDs',
						description: "<p><b>Rowers</b>: PFD Required to be worn by all rowers</p>" +
							"<p><b>Coxswains</b>: PFD Required to be worn from November 1st through April 30th</p>" + 
							"<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>",
						conditions: [
							new Between(DatapointIdentifier.WATER_TEMP, toCelsius(32), toCelsius(50), "F")
						]
					}),
					new Restriction({
						category: 'Comms',
						description: "Protected cell phone required in each launch and shell. Marine radio recommended for coaches. At least one additional person must be on shore with cell phone and car (see Appendix #8)"
					}),
					new Restriction({
						category: 'Crew Skill',
						description: "<p>U14: restricted</p>" +
							"<p>Novice: limited*</p>" +
							"<p>Experienced: approved</p>" +
							"<p>Adaptive: inclusion</p>"
					}),
					new Restriction({
						category: 'More Requirements',
						description: "Additional requirements apply in this zone. See the safety matrix appendix #8."
					})
				]
			})
		],
		unsafeZone: new SafetyZone({
			label: '\u2715',
			color: '#000000',
			conditions: [
				new AtLeast(DatapointIdentifier.WATER_FLOW, 60, "kcfs")
			],
			restrictions: [
				new Restriction({
					category: 'Shell Types',
					description: "No boats allowed on the water"
				}),
				new Restriction({
					category: 'Launches',
					description: "I said no boats"
				}),
				new Restriction({
					category: 'Certification',
					description: "TRRA-Equivalent Certification"
				}),
				new Restriction({
					category: 'PFDs',
					description: "Don't need any to stay on land"
				}),
				new Restriction({
					category: 'Crew Skill',
					description: "None required for staying on land"
				})
			]
		})
	}),
	dataSources: [
		{
			type: APIClientIdentifier.USGS,
			id: "03049640",
			purposeHints: [DatapointIdentifier.WATER_TEMP],
			comment: "Allegheny R at CW Bill Young L&D at Acmetonia, PA"
		},
		{
			type: APIClientIdentifier.NOAA_W1,
			id: "KPIT",
			purposeHints: [DatapointIdentifier.AIR_TEMP, DatapointIdentifier.AIR_SPEED, DatapointIdentifier.AIR_DIRECTION],
			comment: "Pittsburgh International Airport"
		},
		{
			type: APIClientIdentifier.NOAA_WATER,
			id: "shrp1",
			purposeHints: [DatapointIdentifier.WATER_LEVEL, DatapointIdentifier.WATER_FLOW],
			comment: "Allegheny River at Sharpsburg Lock and Dam"
		},
		{
			type: APIClientIdentifier.AIRNOW,
			id: "Pittsburgh_PA",
			purposeHints: [DatapointIdentifier.AIR_QUALITY],
			friendlyPage: "https://www.airnow.gov/?city=Pittsburgh&state=PA&country=USA",
			comment: "Pittsburgh, PA Reporting area"
		},
	]
});


let allClubs = {
	"RIT": ritconfig,
	"TRRA": trraconfig
}


const getConfig = () => {
	const fragment = window.location.hash.substring(1);
	console.log(fragment);
	if (Object.keys(allClubs).includes(fragment)){
		return allClubs[fragment]
	}
	return trraconfig
}

// determine config
export let config = ritconfig;

//Add "shared"/common data sources that do not require site identification strings
config.dataSources.push(...[
	{
		type: APIClientIdentifier.SUNRISE_SUNSET_ORG,
		purposeHints: [DatapointIdentifier.SUNRISE, DatapointIdentifier.SUNSET],
		comment: ""
	}
])

if (!config.plotColors) {
	config.plotColors = {
		flow: '#0088ff',
		flood: '#00ff00',
		temperature: '#ff0000'
	}
}

// (async () => {
//     config = await fetch("./config.json").then(response => response.json());
// })();
