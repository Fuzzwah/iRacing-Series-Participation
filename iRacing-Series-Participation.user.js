// ==UserScript==
// @name       iRacing Series Participation
// @namespace  http://www.fuzzwahracing.com/p/participation.html
// @version    0.6
// @downloadURL		https://raw.githubusercontent.com/fuzzwah/iRacing-Series-Participation/master/iRacing-Series-Participation.user.js
// @updateURL		https://raw.githubusercontent.com/fuzzwah/iRacing-Series-Participation/master/iRacing-Series-Participation.user.js
// @license       MIT; https://raw.githubusercontent.com/fuzzwah/iRacing-Series-Participation/master/LICENSE
// @description  Visualize the participation (drivers and SOF) of any series in the series home page.
// @match      https://members.iracing.com/membersite/member/SeriesNews.do*
// @copyright  2016, Nick Thissen - 2019, Rob Crouch
// ==/UserScript==


// Add Highcharts
(function(){
    if (typeof unsafeWindow.Highcharts == 'undefined') {
        console.log('NT_SeriesParticipation > Getting Highcharts');
        var GM_Head = document.getElementsByTagName('head')[0] || document.documentElement,
            GM_JQ = document.createElement('script');

        GM_JQ.src = 'https://code.highcharts.com/stock/2.1.10/highstock.js';
        GM_JQ.type = 'text/javascript';
        GM_JQ.async = true;

        GM_Head.insertBefore(GM_JQ, GM_Head.firstChild);
    }
    GM_wait();
})();

// Check if Highcharts is loaded
function GM_wait() {
    if (typeof unsafeWindow.Highcharts == 'undefined') {
        window.setTimeout(GM_wait, 100);
    } else {
        //$ = unsafeWindow.jQuery.noConflict(true);

        // Add script to start
        var script = document.createElement("script");
        script.textContent = "(" + NT_seriesParticipation.toString() + ")();";
        document.body.appendChild(script);
    }
}

function NT_seriesParticipation() {

    var NT_debug = false;

    var NT_participationData = {};
    var NT_averageData = {};
    var NT_dataHeaders = null;
    var graphData = {};
    var seriesId = 0;
    var tzOffset = 0;

    var graphType = 'AVG';

    var NT_SP_options = {
        useGMT: {value: false, key: 'NT_useGMT', control: '#NT_chkUseGMT'},
        useColors: {value: true, key: 'NT_useColors', control: '#NT_chkUseColors'},
        useClassColors: {value: true, key: 'NT_useClassColors', control: '#NT_chkUseClassColors'}
    };

    var NT_optionsShowing = false;

    // Logging
    function NT_log(msg, forceLog) {
        forceLog = forceLog || false;
        if ((NT_debug || forceLog) && typeof console !== 'undefined') {
            console.log('NT_SeriesParticipation > ' + msg);
        }
    }

    // CSS
    if (typeof GM_addStyle !== 'function') {
        GM_addStyle = function(css) {
            var style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        };
    }

    function NT_loadOptions() {
        for (var name in NT_SP_options) {
            var opt = NT_SP_options[name];

            var value = localStorage[opt.key] === 'true';
            NT_SP_options[name].value = value;
            $(opt.control).attr('checked', value);
            NT_log('Set control ' + opt.control + ' to ' + value);
        }
        NT_log('Loaded options: ' + JSON.stringify(NT_SP_options));
    }

    function NT_saveOptions() {
        NT_log('Saving options: ' + JSON.stringify(NT_SP_options));
        for (var name in NT_SP_options) {
            var opt = NT_SP_options[name];

            localStorage[opt.key] = opt.value;
        }
    }

    function NT_runSeriesParticipation() {

        seriesId = NT_getSeriesId();
        NT_log('Season ID: ' + seasonId + ', Series ID: ' + seriesId);

        var date = new Date();
        tzOffset = date.getTimezoneOffset();

        if (seasonId && seasonId > 0) {

            // Create container
            NT_createContainer();

            // Load options
            NT_loadOptions();

            // Load data
            NT_getSeriesParticipationData();
        }
    }

    function NT_getSeriesParticipationData() {
        // Reset data
        NT_participationData = {};
        NT_averageData = {};

        // Start processing week 0
        NT_processWeek(0);
    }

    function NT_getDataHeaders(data) {
        if (NT_dataHeaders) return;

        NT_dataHeaders = {};
        for (var key in data) {
            var name = data[key];

            NT_dataHeaders[name] = key;
        }
    }

    function NT_processWeek(week) {
        NT_log('Start processing week ' + week);

        var url = '/memberstats/member/GetSeriesRaceResults?seasonid=' + seasonId + '&raceweek=' + week;
        $.getJSON(url, function(json) {

            if (!json.d || json.d.length === 0) {
                // No more data found, stop looking
                NT_log('No data found for week ' + week);
                $('#NT_loadingData').hide();
                //NT_updateGraph();
                return;
            }

            NT_log('Data found');

            // Get header names
            NT_getDataHeaders(json.m);

            var sessionHeader = NT_dataHeaders.sessionid;
            var ssidHeader = NT_dataHeaders.subsessionid;
            var sofHeader = NT_dataHeaders.strengthoffield;
            var sizeHeader = NT_dataHeaders.sizeoffield;
            var trackHeader = NT_dataHeaders.trackid;
            var startHeader = NT_dataHeaders.start_time;
            var officialHeader = NT_dataHeaders.officialsession;
            var classHeader = NT_dataHeaders.carclassid;

            // Loop through data
            for (var i = 0; i < json.d.length; i++) {

                var result = json.d[i];

                // Get/create class data
                var classId = result[classHeader];
                var classData = NT_participationData[classId];
                if (!classData) {
                    classData = {
                        name: getCarClassById(classId).shortname,
                        sessions: {},
                        order: NT_getClassOrder(classId)
                    };
                }

                // Get/create session data
                var sessionId = result[sessionHeader];
                var sessionData = classData.sessions[sessionId];
                if (!sessionData) {
                    sessionData = {
                        hasSplits: false,
                        drivers: 0,
                        ssid: 0,
                        sof: 0,
                        week: week + 1
                    };
                }
                else {
                    sessionData.hasSplits = true;
                }

                // Add drivers
                var drivers = result[sizeHeader];

                sessionData.drivers += drivers;
                sessionData.unofficial = result[officialHeader] === 0;

                // SOF / ssid: highest split only
                var sof = result[sofHeader];
                var ssid = result[ssidHeader];
                if (sof > sessionData.sof) {
                    sessionData.sof = sof;
                    sessionData.ssid = ssid;
                }

                // Date/time
                var start = result[startHeader];

                if (!NT_SP_options.useGMT.value) {
                    start = start - tzOffset * 60 * 1000;
                }

                sessionData.startDateTime = start;


                // Set data
                classData.sessions[sessionId] = sessionData;
                NT_participationData[classId] = classData;

                // ---------------------------

                // Normalize start date/time to one day of the week
                // 1970-01-06 is the first tuesday in 1970
                // Tue: 1970-01-06
                // Wed: 1970-01-07
                // Thu: 1970-01-08
                // Mon: 1970-01-12
                // getDay: Sun = 0, Mon = 1, ...
                // Required day: getDay + 4

                var date = new Date(start);
                var day = date.getDay() + 4;

                // shift sun and mon to next week because tue is raceweek start
                if (day < 6) day += 7;

                var normalizedStart = new Date(1970, 0, day, date.getHours(), date.getMinutes(), date.getSeconds()).getTime();
                if (!NT_averageData[normalizedStart]) NT_averageData[normalizedStart] = {
                    date: normalizedStart,
                    classes: {},
                    sessions: {},
                    sessionCount: 0,
                    drivers: 0,
                    sof: 0};

                // Do not count splits as separate sessions (we want total drivers, not drivers per split)
                if (!NT_averageData[normalizedStart].sessions[sessionId]) {
                    // this session was not present yet, new session
                    NT_averageData[normalizedStart].sessions[sessionId] = true;
                    NT_averageData[normalizedStart].sessionCount += 1;
                }

                NT_averageData[normalizedStart].drivers += drivers;
                NT_averageData[normalizedStart].sof += sof;
            }

            // Update view
            NT_updateData();

            // Continue with next week
            NT_processWeek(week + 1);
        });
    }

    function NT_updateData() {
        NT_log('Start updating data');

        graphData = {};

        // Create data for graph
        graphData.seasonSeries = [];

        var order = 0;

        var sortedClassIds = [];

        if (!NT_multiclasses[seriesId]) {
            // Just copy over order
            for (var classId in NT_participationData) {
                sortedClassIds.push(classId);
            }
        }
        else {
            // Sort by custom defined order
            var sortlist = [];
            for (var classId in NT_participationData) {
                sortlist.push([classId, NT_participationData[classId].order]);
            }
            sortlist.sort(function(a,b){
                return a[1] - b[1];
            });

            for (var i = 0; i < sortlist.length; i++) {
                sortedClassIds.push(sortlist[i][0]);
            }
        }

        for (var i = 0; i < sortedClassIds.length; i++) {

            var classId = sortedClassIds[i];
            if (classId === null || !NT_participationData.hasOwnProperty(classId)) continue;

            var classData = NT_participationData[classId];
            if (classData === null) continue;

            var classSeries = {
                name: classData.name,
                data: [],
                stack: 'drivers'
            };

            // Is multiclass?
            if (sortedClassIds.length > 1) classSeries.color = NT_getClassColor(classId, order);

            NT_log('Class ' + classId + ': ' + classData.name);

            for (var sessionId in classData.sessions) {
                if (sessionId === null) continue;

                var session = classData.sessions[sessionId];
                if (session === null) continue;

                NT_log('Start making point: ' + JSON.stringify(session));
                var point = {
                    x: session.startDateTime,
                    y: session.drivers,
                    week: session.week,
                    ssid: session.ssid,
                    sof: session.sof
                };
                NT_log('Point: ' + JSON.stringify(point));

                if (NT_SP_options.useColors.value) {
                    if (session.unofficial) point.color = '#ffb4a9';
                }

                classSeries.data.push(point);

            }

            order += 1;
            graphData.seasonSeries.push(classSeries);
        }

        //// Add sof series
        //graphData.seasonSeries.push({
        //    name: 'SOF',
        //    data: sofData,
        //    yAxis: 1,
        //    color: '#aaa',
        //    pointPadding: 0.45,
        //    stack: 'sof'
        //});

        // Averaged data
        graphData.avgDriverData = [];
        graphData.avgSofData = [];

        for (var date in NT_averageData) {
            if (date == null) continue;
            if (!NT_averageData.hasOwnProperty(date)) continue;
            var result = NT_averageData[date];

            var count = result.sessionCount;
            graphData.avgDriverData.push([result.date, Math.round(result.drivers / count)]);
            graphData.avgSofData.push([result.date, Math.round(result.sof / count)]);
        }
        NT_log('Updated data complete');

        NT_updateGraph();
    }

    function NT_updateGraph() {
        NT_log('Updating graph');
        if (graphType === 'AVG') {
            NT_createWeekGraph();
        } else {
            NT_createSeasonGraph();
        }
    }

    function NT_createWeekGraph() {
        $('#NT_participation_graph').highcharts('StockChart', {
            chart: {
                type: 'column',
                zoomType: 'x'
            },
            rangeSelector: {
                buttons: [{
                    type: 'day',
                    count: 1,
                    text: 'day'
                }, {
                    type: 'all',
                    text: 'week'
                }],
                selected: 1,
                inputEnabled: false
            },
            navigator: {
                xAxis: {
                    dateTimeLabelFormats: {
                        month: '%a',
                        week: '%a',
                        day: '%a',
                        hour: '%a %H:%M',
                        minute: '%a %H:%M'
                    }
                }
            },
            title: {
                text: 'Averaged Series Participation'
            },
            xAxis: {
                type: 'datetime',
                ordinal: false,
                dateTimeLabelFormats: {
                    month: '%a',
                    week: '%a',
                    day: '%a',
                    hour: '%a %H:%M',
                    minute: '%a %H:%M'
                },
                title: {
                    text: 'Day'
                }
            },
            yAxis: {
                title: {
                    text: 'Drivers'
                },
                min: 0,
                opposite: false
            },
            //yAxis: [{
            //    title: {
            //        text: 'Drivers'
            //    },
            //    min: 0,
            //    opposite: false
            //}, {
            //    title: {
            //        text: 'SOF',
            //        style: {
            //            color: '#777'
            //        }
            //    },
            //    labels: {
            //        style: {
            //            color: '#777'
            //        }
            //    },
            //    min: 0,
            //    opposite: true
            //}],
            tooltip: {
                formatter: function() {
                    var s = [];
                    s.push(Highcharts.dateFormat('%A %H:%M', new Date(this.x)));
                    $.each(this.points, function(i, point) {
                        s.push('<span style="color:' + point.series.color + '">\u25CF</span> ' + point.series.name + ': ' + point.y);
                    });
                    return s.join('<br />');
                },
                shared: true
            },
            plotOptions: {
                column: {
                    grouping: false
                },
                series: {
                    animation: false,
                    turboThreshold: 10000,
                    cursor: 'pointer',
                    dataGrouping: {
                        enabled: false
                    }
                }
            },
            series: [{
                name: 'Drivers',
                data: graphData.avgDriverData
            }]
            //    {
            //    name: 'SOF',
            //    data: graphData.avgSofData,
            //    yAxis: 1,
            //    color: '#777',
            //    pointPadding: 0.45
            //}]
        });
    }

    function NT_createSeasonGraph() {
        $('#NT_participation_graph').highcharts('StockChart', {
            chart: {
                type: 'column',
                zoomType: 'x'
            },
            rangeSelector: {
                buttons: [{
                    type: 'day',
                    count: 1,
                    text: 'day'
                }, {
                    type: 'week',
                    count: 1,
                    text: 'week'
                }, {
                    type: 'all',
                    text: 'all'
                }],
                selected: 1
            },
            title: {
                text: 'Series Participation'
            },
            xAxis: {
                type: 'datetime',
                ordinal: false,
                dateTimeLabelFormats: {
                    month: '%e. %b',
                    year: '%b',
                    day: '%a',
                    hour: '%a %H:%M',
                    minute: '%a %H:%M'
                },
                title: {
                    text: 'Date'
                }
            },
            //yAxis: [{
            //    title: {
            //        text: 'Drivers'
            //    },
            //    min: 0,
            //    opposite: false
            //}, {
            //    title: {
            //        text: 'SOF',
            //        style: {
            //            color: '#777'
            //        }
            //    },
            //    labels: {
            //        style: {
            //            color: '#777'
            //        }
            //    },
            //    min: 0,
            //    opposite: true
            //}],
            yAxis: {
                title: {
                    text: 'Drivers'
                },
                min: 0,
                opposite: false
            },
            tooltip: {
                formatter: function() {
                    var week = '?';
                    var s = [];

                    $.each(this.points, function(i, p) {
                        if (week === '?') week = p.point.week;
                        s.push('<span style="color:' + p.series.color + '">\u25CF</span> ' + p.series.name + ': ' + p.y);
                    });
                    var date = new Date(this.x);
                    var dateString = Highcharts.dateFormat('%a', date) + ' W' + week + ', ' + Highcharts.dateFormat('%H:%M', date);
                    return dateString + '<br />' + s.join('<br />');
                },
                shared: true
            },
            plotOptions: {
                column: {
                    stacking: 'normal'
                },
                series: {
                    animation: false,
                    turboThreshold: 10000,
                    cursor: 'pointer',
                    dataGrouping: {
                        enabled: false
                    },
                    point: {
                        events: {
                            click: function() {
                                var ssid = this.ssid;
                                window.open('http://members.iracing.com/membersite/member/EventResult.do?&subsessionid=' + ssid);
                            }
                        }
                    }
                }
            },
            series: graphData.seasonSeries
        });
    }

    function NT_createContainer() {

        $("<div id='NT_participation_container'>" +
        "<div><button id='NT_btnAverageGraph' type='button'>Averaged</button>" +
        "<button id='NT_btnSeasonGraph' type='button'>Season</button>" +
        "<button id='NT_btnOptions' type='button'>Show options</button>" +
        "<span id='NT_loadingData'>Loading...</span></div>" +
        "<div id='NT_optionsPanel'>" +
        "<input id='NT_chkUseGMT' type='checkbox' /><label for='NT_chkUseGMT'>Times in GMT</label><br />" +
        "<input id='NT_chkUseColors' type='checkbox' /><label for='NT_chkUseColors'>Highlight unofficial races</label><br />" +
        //"<input id='NT_chkUseClassColors' type='checkbox' /><label for='NT_chkUseClassColors'>Show multi-class participation</label>" +
		"</div>" +
        "<div><div id='NT_participation_graph'></div></div></div>").insertAfter('.serieshome_info');

        $('#NT_btnAverageGraph').click(function() {
            NT_toggleGraph(true);
        });
        $('#NT_btnSeasonGraph').click(function() {
            NT_toggleGraph(false);
        });
        $('#NT_btnOptions').click(function() {
            NT_toggleOptions();
        });

        $('#NT_chkUseGMT').change(function() {
            NT_SP_options.useGMT.value = $(this).is(':checked');
            NT_saveOptions();
            NT_getSeriesParticipationData();
        });
        $('#NT_chkUseColors').change(function() {
            NT_SP_options.useColors.value = $(this).is(':checked');
            NT_saveOptions();
            NT_updateData();
        });
        $('#NT_chkUseClassColors').change(function() {
            NT_SP_options.useClassColors.value = $(this).is(':checked');
            NT_saveOptions();
            NT_updateData();
        });

        $('#NT_optionsPanel').hide();
        NT_optionsShowing = false;

        NT_log('Container created');
    }

    function NT_toggleGraph(average) {
        if (average) {
            graphType = 'AVG';
        } else {
            graphType = 'SEASON';
        }
        NT_updateGraph();
    }

    function NT_toggleOptions() {
        if (NT_optionsShowing) {
            $('#NT_btnOptions').text('Show options');
            $('#NT_optionsPanel').hide();
            NT_optionsShowing = false;
        }
        else {
            $('#NT_btnOptions').text('Hide options');
            $('#NT_optionsPanel').show();
            NT_optionsShowing = true;
        }
    }

    function NT_getSeriesId() {
        return getSeasonById(seasonId).seriesid; //already exists on page
    }

    var NT_defaultColors = ['#7cb5ec', '#90ed7d', '#f7a35c', '#8085e9',
        '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1'];

    var NT_classColors = ['#ffda59', '#33ceff', '#ff5888', '#ae6bff', '#53ff77'];

    var NT_multiclasses = {
        '227': {
            name: 'WSCS',
            classes: {
                '40': {
                    order: 0,
                    car: 'HPD'
                },
                '18': {
                    order: 1,
                    car: 'Riley DP'
                },
                '41': {
                    order: 2,
                    car: 'Ford GT'
                },
                '58': {
                    order: 3,
                    car: 'RUF'
                }
            }
        }
    };

    function NT_getClassColor(classId, order) {

        // Is there a series override defined?
        var series = NT_multiclasses[seriesId];
        if (series) {
            if (series.classes[classId]) {
                return NT_classColors[series.classes[classId].order];
            }
        }

        return NT_classColors[order];
    }

    function NT_getClassOrder(classId) {
        var series = NT_multiclasses[seriesId];
        if (series) {
            if (series.classes[classId]) {
                return series.classes[classId].order;
            }
        }
        return 0;
    }



    $(document).ready(function() {
        NT_log('Starting');

        // CSS
        GM_addStyle('#NT_participation_container{padding:5px;height:455px;} ' +
        '#NT_participation_graph{height:450px;} ' +
        '#NT_loadingData {margin-left: 10px;} ' +
        '#NT_btnOptions {margin-left: 10px;} ' +
        '#NT_optionsPanel {margin-top: 5px;}');

        NT_log('Highcharts: ' + Highcharts.version);
        NT_runSeriesParticipation();
    });
}
