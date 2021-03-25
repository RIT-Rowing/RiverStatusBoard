//		RiverStatusBoard: Information for Rowers and Paddlers
//		Allegheny River information for Three Rivers Rowing Association (TRRA)
//		by Maxwell B Garber <max.garber+dev@gmail.com>
//		app-2021.js created 2021-03-23

var AppViewModel = function () {
	this._initString = ' ';
	this.referenceToAppViewModel = this;
	this.devMode = true;
	
	/// # UI Toggles
    this.graphEnabled = ko.observable(true);
	this.lastUpdatedVisible = ko.observable(true);
	this.lastUpdated = ko.observable('');
	
	/// # Water
	this.waterFlow = ko.observable(this._initString);
	this.waterFlowUnits = ko.observable("kcfs");
	this.waterFlowColor = ko.computed(function () {
		var color = trra_safety.rowing.zoneColorForWaterFlow(this.waterFlow());
		return color;
	}, this);
	this.waterLevel = ko.observable(this._initString);
	this.waterLevelUnits = ko.observable("ft");
	this.waterTemp = ko.observable(this._initString);
	this.waterTempUnits = ko.observable("˚C");
	this.waterTempColor = ko.computed(function () {
		var color = trra_safety.rowing.zoneColorForWaterTemp(this.waterTemp());
		return color;
	}, this);
	this.waterTempF = ko.computed(function () {
		let tempC = this.waterTemp();
		var tempF = '';
		if (tempC != null && tempC != this._initString) {
			tempF = (tempC * (9/5)) + 32;
			tempF = tempF.toFixed(1);
		}
		return tempF;
	}, this);
	
	/// # Air
	this.airPropertiesEnabled = ko.observable(true);
	this.airTemp = ko.observable(this._initString);
	this.airTempUnits = ko.observable("˚C");
	this.airTempF = ko.computed(function() {
		let tempC = this.airTemp();
		var tempF = '';
		if (tempC != null && tempC != this._initString) {
			tempF = (tempC * (9/5)) + 32;
			tempF = tempF.toFixed(1);
		}
		return tempF;
	}, this);
	this.airTempUnitsF = ko.observable("˚F");
	this.airSpeed = ko.observable(this._initString);
	this.airSpeedUnits = ko.observable("mph");
	this.airDirxn = ko.observable(this._initString);
	
	/// # Sun
	this.sunrise = ko.observable(this._initString);
	this.sunset = ko.observable(this._initString);
	this.sunriseText = ko.computed(function () {
		if (this.sunrise() != this._initString) {
			return this.sunrise().format('h:mm a');
		} else {
			return this._initString;
		}
	}, this);
	this.sunsetText = ko.computed(function () {
		if (this.sunset() != this._initString) {
			return this.sunset().format('h:mm a');
		} else {
			return this._initString;
		}
	}, this);
	
	this.daylight = ko.computed(function() {
		if (moment != null && this.sunrise() != this._initString && this.sunset() != this._initString) {
			var now = moment();
			var afterDawn = now.isAfter(this.sunrise());
			var beforeDusk = now.isBefore(this.sunset());
			return (afterDawn && beforeDusk);
		} else {
			return this._initString;
		}
	}, this);
	
	/// # Internal-Private
	this._updated = ko.computed(function () {
		var updated = true;
		updated = updated && !(this.waterFlow() == this._initString);
		updated = updated && !(this.waterLevel() == this._initString);
		updated = updated && !(this.waterTemp() == this._initString);
		if (this.airPropertiesEnabled()) {
			updated = updated && !(this.airTemp() == this._initString);
			updated = updated && !(this.airSpeed() == this._initString);
			updated = updated && !(this.airDirxn() == this._initString);
		}
		updated = updated && !(this.sunrise() == this._initString);
		updated = updated && !(this.sunset() == this._initString);
		return updated;
	}, this);
	
	this._readyToComputeZone = ko.computed(function () {
		var ready = true;
		ready = ready && !(this.waterFlow() == this._initString);
		ready = ready && !(this.waterTemp() == this._initString);
		ready = ready && !(this.sunrise() == this._initString);
		ready = ready && !(this.sunset() == this._initString);
		return ready;
	}, this);
	
	/// # Zone
	this.zone = ko.computed(function () {
		var zone = this._initString;
		
		//	don't try to calculate until necessary values fetched
		if (this._readyToComputeZone()) {
			//	Declared in trra-safety.js
			zone = trra_safety.rowing.zoneForConditions(
				this.waterFlow(), this.waterTemp(),
				this.sunrise(), this.sunset()
			);
		}
		
		return zone;
	}, this);
	
    this.zoneColor = ko.computed(function () {
		var color = trra_safety.rowing.zoneColorForZone(this.zone());
		return color;
	}, this);
	
	this.zoneDisplay = ko.computed(function () {
		let zone = this.zone();
		if (zone > 6) {
			// show prohibited
			return '\u2715'; //'✕';
		} else {
			return zone;
		}
	}, this);
	
	this.daylightDisplay = ko.computed(function() {
		return '';
	}, this);
	
	this.footnoteVisible = ko.computed(function () {
		let zone = this.zone();
		return (zone == 5);
	}, this);
	
	this.footnoteHtml = ko.computed(function () {
		return "";
	}, this);
	
	/// # Experimental	
	this.waterTempNote = ko.computed(function () {
		if (this.waterTempF() < -10) {
			document.querySelector('#dataField-temp').parentElement.hidden = true;
			document.querySelector('#dataField-tempF').parentElement.hidden = true;
			return '<a href="https://www.usgs.gov/news/usgs-working-restore-streamgages">USGS equipment malfunction</a>';
		} else {
			return '';
		}
	}, this);
	
	this.waterTempNoteVisible = ko.computed(function () {
		return (this.waterTempNote() != '');
	}, this);
	
	// @section controlElements' functions
	this.toggleAttribution = function () {
		$('#attributionRow').slideToggle();
		// let y = $('#attributionRow').position().top;
		// window.scrollTo(0,y*1.1);
	};
	
	this.manualRefresh = function () {
		this.update();
		$("#refresh-button").rotate({
			angle:0,
			animateTo: 720,
			duration: 1500,
			easing: $.easing.easeInOutExpo
		});
	}
	
	/// # Safety Rules
	
    /// ## Allowed Shell Types (2021✓)
    this.shellTypes = ko.computed(function () {
        if (!this._readyToComputeZone()) { return ''; }        
		let zone = this.zone();
        let flow = this.waterFlow();
        var shellTypes = "<p>";

        if (zone == 1) {
            shellTypes = "All boats";
        } else if (zone == 2) {
            shellTypes = "Racing shells: All types\nAdaptive shells: PR3 2x only";
        } else if (zone == 3) {
            shellTypes = "8+, 4+, 4x";
            if (0 <= flow && flow < 40.0) {
                shellTypes += ", 2x"
            }
        } else if (zone == 4) {
            shellTypes = "8+, 4+, 4x";
        } else if (zone == 5) {
            shellTypes = "8+, 4x";
        }
        shellTypes += "</p>";

        if (zone == 1 || zone == 2) {
            shellTypes += "<p>Racing allowed</p>";
        } else if (zone == 3 || zone == 4 || zone == 5) {
            shellTypes += "<p>No racing allowed</p>";
        }

        return shellTypes;
	}, this);
	
    /// ## Launch to Shell Ratio (2021✓)
    this.launchRatio = ko.computed(function () {
		if (!this._readyToComputeZone()) { return ''; }
        let zone = this.zone();
		var launchToShellRatio = '';

        if (zone == 1) {
            launchToShellRatio = "Not Required except for U18/HS";
        } else if (zone == 2) {
            launchToShellRatio = "1 launch per 3 shells";
        } else if (zone == 3) {
            launchToShellRatio = "1 launch per 2 shells";
        } else if (zone == 4) {
            launchToShellRatio = "1 launch per shell";
        } else if (zone == 5) {
            launchToShellRatio = "1 launch per shell and sufficient launches to:\n" + 
                "(a) carry all rowers and coxes participating in the session\n" +
                "(b) have at least 2 engines between all launches on the water (towing line required)";
        }

		return launchToShellRatio;
	}, this);
	
    /// ## Coach Certification
    this.coachCert = ko.computed(function () {
        return "TRRA-Equivalent Certification";
	}, this);
	
    /// ## PFD Requirement
    this.pfdReq = ko.computed(function () {
        if (!this._readyToComputeZone()) { return ''; }
        let zone = this.zone();
        let waterTempF = this.waterTempF();

        var rowersReq = "";

        /// - TODO: Automate this date check
        // let month = moment…
        // let day = moment…
        var coxesReq = "PFD Required to be worn from November 1st through April 30th";

        if (zone == 1) {
            rowersReq = "PFD Not required";
        } else if (zone == 2) {
            rowersReq = "PFD Recommended to be worn or in shell for 1x, 2x, 2-";
        } else if (zone == 3) {
            rowersReq = "PFD Recommended to be worn or in shell for all rowers";
        } else if (zone == 4 || zone == 5) {
            if (32.0 < waterTempF && waterTempF < 50.0) {
                rowersReq = "PFD Required to be worn by all rowers"
            } else if (waterTempF > 50.0) {
                rowersReq = "PFD Recommended to be worn or in shell at all times";
            } else {
                // problem?
            }
        } else {
            // problem?
        }

        let fullReqs = "<p><b>Rowers</b>: " + rowersReq + "</p>" +
            "<p><b>Coxswains</b>: " + coxesReq + "</p>" + 
            "<p><b>Coaches & Launch Occupants</b>: PFD to be worn at all times</p>";

		return fullReqs;
	}, this);
	
    /// ## Communications Equipment
    this.commsEquip = ko.computed(function () {
        if (!this._readyToComputeZone()) { return ''; }
        let zone = this.zone();

        var commsReq = "";
        if (zone == 1) {
            commsReq = "A whistle is <i>required</i> and protected cell phone recommended in each launch or in each shell not accompanied by a launch";
        } else if (zone == 2 || zone == 3 || zone == 4) {
            commsReq = "Protected cell phone <i>required</i> in each launch <i>and</i> recommended in each shell";
        } else if (zone == 5) {
            commsReq = "Protected cell phone required in each launch and shell. Marine radio recommended for coaches. At least one additional person must be on shore with cell phone and car (see Appendix #8)";
        } else {
            // problem?
        }
		
		return commsReq;
	}, this);
	
    /// ## Crew Skill Level
    this.crewSkill = ko.computed(function () {
        if (!this._readyToComputeZone()) { return ''; }
        let zone = this.zone();

        var skill_u14 = '<p>U14: ';
        var skill_novice = '<p>Novice: ';
        var skill_experienced = '<p>Experienced: ';
        var skill_adaptive = '<p>Adaptive: ';

        if (zone == 1) {
            skill_u14 += "approved";
            skill_novice += "approved";
            skill_experienced += "approved";
            skill_adaptive += "approved";
        } else if (zone == 2) {
            skill_u14 += "restricted";
            skill_novice += "approved";
            skill_experienced += "approved";
            skill_adaptive += "PR3 only";
        } else if (3 <= zone && zone <= 5) {
            skill_u14 += "restricted";
            skill_novice += "limited*";
            skill_experienced += "approved";
            skill_adaptive += "restricted";
        } else {
            // problem?
        }

		let fullSkillReqs = skill_u14 + "</p>" + skill_novice + "</p>" + skill_experienced + "</p>" + skill_adaptive + "</p>";
        return fullSkillReqs
	}, this);
	
    /// ## Additional Safety Information
    this.additionalSafety = ko.computed(function () {
        if (!this._readyToComputeZone()) { return ''; }
        return '';
	}, this);
	
	/// # Primary Operation
	this.update = function () {
		//	Pattern: for given variable, invoke corresponding function declared in apiConceierge
		//	  …pass in the setter method (in this case the observable itself) so it can update it
		//	  …asynchronously when the API call returns
		apiConcierge.getValueAsync('waterFlow', this.waterFlow);
		apiConcierge.getValueAsync('waterLevel', this.waterLevel);
		apiConcierge.getValueAsync('waterTemp', this.waterTemp);
		// intervene for unit switching

		//	Air temp & wind are disabled b/c OpenWeatherMap doesn't support HTTPS and I don't know
		//	  …how to modify the content security policy to allow mixed resource use
		// getAirTemp(this.airTemp);
		// getAirSpeed(this.airSpeed);
		// getAirDirxn(this.airDirxn);
		apiConcierge.getValueAsync('airTemp', this.airTemp);
		apiConcierge.getValueAsync('airSpeed', this.airSpeed);
		apiConcierge.getValueAsync('airDirxn', this.airDirxn);
		apiConcierge.getValueAsync('sunrise', this.sunrise);
		apiConcierge.getValueAsync('sunset', this.sunset);
		let now = moment().format("h:mm a");
		this.lastUpdated(now);
		return true;
	};
};

// EOF
