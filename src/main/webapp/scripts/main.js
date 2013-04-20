$(function() {

    var prefix = "/"
    var color = d3.scale.category10();
    var colormap = {};
    var btnmap = {};
    var selected = {};
    var graph = {};
    var hist = {};
    var selectedHist = {};
    var graphTrans = [0,0],
        graphScale = 1;


    // Create the d3.js graph canvas
    var width = $(window).width() - 20,
        height = $(window).height() - 20;

    var zoomer = d3.behavior.zoom();

    var graphSVG = d3.select("#graph")
                .append("svg")
                .attr("width", width)
                .attr("height", height);

    var resizeTimer;
    
    // Adapt the graph canvas to window resizes
    $(window).resize(function() {
        clearTimeout(resizeTimer);
        resizeTimer = setInterval(function(){
            width = $(window).width() - 20;
            height = $(window).height() - 20;
            d3.select("#graph > svg")
                .attr("width", width)
                .attr("height", height);
            updateHistogram(Object.keys(colormap));
            clearTimeout(resizeTimer);
        }, 200);
    });

    // Get values for the language autocomplete box
    $.getJSON(prefix + 'langs', function(data) {
         var langs = data.map(function(x){ return x.name;})

         $("#langsearch").autocomplete ({
                source: langs,
                minLength: 1,
                delay : 100,
                focus: function( event, ui ) {},
                select: function( event, ui ) {
                    $("#langsearch").val("");
                    createLangButton(ui.item.label, $('#selected-languages'));
                    update(Object.keys(colormap));
                    return false;
                }
            });
         return langs;
    });

    $("#algo").change(function(){
        updateGraph(Object.keys(colormap));
    });

    // Convert an HTML hex colour to an RGB triplette
    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    // On select a language from the JQuery drop down add a language button
    // to the language button div. Setup a handler for when close is clicked.
    function createLangButton(lang, appendTo) {
        var c = colormap[lang];

        if ( !c ) {
            c = color(lang);
            colormap[lang] = c;
            var rgb = hexToRgb(c);

            btnmap[lang] = $('<span/>',{
                class: 'langLabel',
                style: 'background: rgba(' + rgb.r + ',' + rgb.g +',' + rgb.b+ ', 0.8)',
                id: 'lang-' + lang
            }).append(
                (lang) + '<span class="lang-remove">&#10006;</span>'
            ).appendTo( appendTo )[0];

            $('#lang-' + lang + '> span.lang-remove').click(function(){
                $(this).parent().remove();
                delete colormap[lang];
                update(Object.keys(colormap));
            });
        }
        return c;
    };

    function update(langs, from, to) {
        updateGraph(langs, from, to);
        updateHistogram(langs, from, to);
    }

    // Scale links and nodes to the new zoom level, using CSS transformations
    function onzoom() {
        graphScale = zoomer.scale();
        graphTrans = zoomer.translate();
        d3.selectAll(".node").attr("transform",
            "translate("+graphTrans+")"+" scale("+graphScale+")");
        d3.selectAll(".link").attr("transform",
            "translate("+graphTrans+")"+" scale("+graphScale+")");
    }

    function formatLangReqURL(langs, from, to) {
        from = from || selectedHist.start || 0;
        to = to || selectedHist.end || (Math.pow(2,32) - 1);

        if (from == to){
            from = 0;
            to = (Math.pow(2,32) - 1);
        }

        var tmp = langs.reduce(function(acc, x){return acc + "l=" + encodeURIComponent(x) + "&" ;},"");
        var q = tmp + "f=" + from + "&t=" + to;
        return q;
    }

    // Scale links and nodes to the new zoom level, using CSS transformations
    function updateGraph(langs, from, to) {
        d3.select("#graph > svg > g").remove();
        d3.select("#totalNodesLabel").text(0);
        d3.select("#totalLinksLabel").text(0);

        if (langs.length == 0)
            return;

        var algo = $("#algo").val();
        var q = formatLangReqURL(langs, from, to) + "&m=" + algo;

        d3.json(prefix + "links?" + q, function(error, g) {

            graph = g;

            d3.select("#totalNodesLabel").text(g.nodes.length);
            d3.select("#totalLinksLabel").text(g.links.length);

            // Define the plotting area
            var plot = graphSVG.append('g')
                          .call(zoomer.on("zoom", onzoom ));

            var force = d3.layout.force()
                        .charge(-220)
                        .gravity(0.2)
                        .linkDistance(250)
                        //.alpha(0.5)
                        .size([width, height]);

            force.nodes(graph.nodes)
                 .links(graph.links);

            var link = plot.selectAll(".link")
                          .data(graph.links)
                          .enter()
                          .append("line")
                          .attr("class", "link")
                          .style("stroke-width", 1)
                          .on("mouseover", linkMouseover)
                          .on("mouseout", mouseout);

            var node = plot.selectAll(".node")
                          .data(graph.nodes)
                          .enter()
                          .append("circle")
                          .attr("class", "node")
                          .attr("r", function(d){return radius(d);})
                          .style("fill", function(d) { return colormap[d.lang]; })
                          .on("click", nodeClick)
                          .on("mouseover", nodeMouseover)
                          .on("mouseout", mouseout)
                          .call(force.drag);

            node.append("title").text(function(d) { return d.name; });

            force.on("tick", function() {
                node.attr("cx", function(d) { return d.x; })
                    .attr("cy", function(d) { return d.y; });

                link.attr("x1", function(d) { return d.source.x; })
                    .attr("y1", function(d) { return d.source.y; })
                    .attr("x2", function(d) { return d.target.x; })
                    .attr("y2", function(d) { return d.target.y; });
            });

            function radius(d) {
                var rank = d.rank * 1000.0;
                if (rank > 0)
                    return rank;
                else
                    return 2;
            }

            force.start();
        });
    }

    function linkMouseover(d) {
        graphSVG.selectAll(".link").classed("active", function(p) { return p === d; });
        graphSVG.selectAll(".node").classed("active", function(p) { return p === d.source || p === d.target; });
      }

      // Highlight the node and connected links on mouseover.
      function nodeMouseover(d) {
        graphSVG.selectAll(".link").classed("active", 
            function(p) { return p.source === d || p.target === d; });
        d3.select(this).classed("active", true);
        d3.select("#lang-" + d.lang).classed("active", true);
      }

      // Clear any highlighted nodes or links.
      function mouseout() {
        d3.selectAll(".active").classed("active", false);
      }

    function nodeClick(n) {

//        d3.json(prefix + "project?p=" + n.pid, function(error, p) {

            var x = (n.x * graphScale) + graphTrans[0];
            var y = (n.y * graphScale) + graphTrans[1];

            var owner = n.name.split("/")[0];
            var project = n.name.split("/")[1];
            var url = "http://github.com/" + p.name;

            showPopup( "Project: "  + project,
                      ["Language: " + (n.lang || UNKNOWN),
                       "Owner: "    + owner,
                       "Common devs with: "    + graph.links.filter(function(x){return (x.source == n || x.target == n);}).length + " projects",
                       "Rank: "     + n.rank,
                       "Url: <a target=\"_blank\" href=\"" + url + "\">" + url + "</a>"], 
                      [x,y]);
      //  });

        showPopup
    }

    function showPopup(title,contents,pos) {
        $("#pop-up").fadeOut(100,function () {
            // Popup content
            $("#pop-up-title").html(title);
            $("#pop-up-content").html( "" );
            for (var i = 0; i < contents.length; i++) {
                $("#pop-up-content").append("<div>"+contents[i]+"</div>");
            }
            // Popup position
            var popLeft = pos[0]+20;
            var popTop  = pos[1]+20;
            $("#pop-up").css({"left":popLeft,"top":popTop});
            $("#pop-up").fadeIn(100);
        });
    }

    $("#pop-up").mouseleave(function(e){
        $("#pop-up").fadeOut(50);
    })

    function hidePopup() {
        eff = $("#pop-up").delay(100).fadeOut(50);
        d3.select(this).attr("fill","url(#ten1)");
    }

    function updateHistogram(languages, from, to) {
        d3.select("#hist > svg").remove();

        if(languages.length == 0)
            return;
        var q = formatLangReqURL(languages, from, to);

        d3.json("hist?" + q, function(error, data) {
            var margin = {top: 3, right: 60, bottom: 20, left: 50},
                width = $("#hist").width() - margin.right,
                height = $("#hist").height() - margin.bottom;

            // x axis configuration
            var x = d3.time.scale().range([0, width]);
            var xAxis = d3.svg.axis()
                .scale(x)
                .orient("bottom");
            x.domain(d3.extent(data, function(d) { return d.date; }));

            // y axis configuration
            var y = d3.scale.linear().range([height, 0]);
            var yAxis = d3.svg.axis()
                .scale(y)
                .orient("left")
                .ticks(4);
            var commitsPerDate = d3.values(data.reduce(function(acc, x){
                                            if(x.date in acc){acc[x.date] += x.count;}
                                            else {acc[x.date] = x.count}; 
                                            return acc;}, {}));
            y.domain([0, d3.max(commitsPerDate)]);

            // Plot area configuration
            var svg = d3.select("#hist").append("svg")
                        .attr("width", width + margin.left + margin.right)
                        .attr("height", height + margin.top + margin.bottom)
                        .append("g")
                        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            var brush = d3.svg.brush()
                        .x(x)
                        .on("brushend", brushend);

            svg.append("g")
               .attr("class", "brush")
               .call(brush)
               .selectAll("rect")
               .attr("y", -6)
               .attr("height", height + 7);        

            // Create a stack of plot data indexed by language name
            var stack = d3.layout.stack().values(function(d) { return d.values; });
            var langs = stack(languages.map(function(lang){
                return {
                    name: lang,
                    values: data.filter(function(x){ return x.lang == lang}).map(function(d){
                        return {
                            date: d.date,
                            y: d.count
                        }
                    })
                }
            }));

            var area = d3.svg.area()
                        .x(function(d) { return x(d.date); })
                        .y0(function(d) { return y(d.y0); })
                        .y1(function(d) { return y(d.y0 + d.y); });

            var lang = svg.selectAll(".browser")
                  .data(langs)
                  .enter().append("g")
                  .attr("class", "browser");

            lang.append("path")
                  .attr("class", "area")
                  .attr("d", function(d) { return area(d.values); })
                  .style("fill", function(d) { return colormap[d.name]; });

            svg.append("g")
                  .attr("class", "x axis")
                  .attr("transform", "translate(0," + height + ")")
                  .call(xAxis);

            svg.append("g")
                  .attr("class", "y axis")
                  .call(yAxis)
                  .append("text")
                  .attr("transform", "rotate(-90)")
                  .attr("y", 6)
                  .attr("dy", ".71em")
                  .style("text-anchor", "end")
                  .text("commits");

            function brushend() {
                var e = brush.extent();
                var from = Math.round(e[0].getTime() / 1000)
                    to = Math.round(e[1].getTime() / 1000);

                if (from != to)
                    selectedHist = {
                        start: from,
                        end: to  
                    }
                else
                    selectedHist = {}
                
                updateGraph(languages, from, to);

                // var links = Array.range(selectedHist.start, selectedHist.end, 604800).reduce(
                //     function(acc, to) {
                //         acc.push("links?" + formatLangReqURL(languages) + "&f=" + selectedHist.start + "&t=" + to);
                //         return acc;
                //     }, new Array());

                // links.forEach(function(x) {
                //     d3.json(x, function(e, l) {

                //     })
                // });

                // var suggestions = links.select(function (text) {
                //     return  $.ajaxAsObservable({url: 'text', dataType: 'json'});
                // }).where( function (data) {
                //     return data.length == 2 && data[1].length > 0;
                // }).switchLatest();

                // if (selectedHist.start != selectedHist.end) {
                //     $('#play').show();
                //     $('#play').addClass('langLabel');
                //     $('#play').css('background', 'rgba(0,0,0, 0.5)');
                // } else {
                //     $('#play').removeClass('langLabel');
                //     $('#play').hide();
                // }
            }
        });
    }

    $('#play').mouseenter(function(){
        $('#play').addClass('active');
    });

    $('#play').mouseleave(function(){
        $('#play').removeClass('active');
    });

    $('#play').click(function(){
        
    });
});

Array.range= function(a, b, step){
    var A= [];
    if (typeof a == 'number') {
        A[0] = a;
        step = step || 1;
        while(a + step <= b){
            A[A.length] = a+= step;
        }
    }
    else {
        var s = 'abcdefghijklmnopqrstuvwxyz';
        if(a === a.toUpperCase()){
            b = b.toUpperCase();
            s = s.toUpperCase();
        }
        s = s.substring(s.indexOf(a), s.indexOf(b)+ 1);
        A = s.split('');        
    }
    return A;
}

