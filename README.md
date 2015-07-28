# whistle
[![node version][node-image]][node-url]
[![npm download][download-image]][download-url]

[node-image]: https://img.shields.io/badge/node.js-%3E=_0.10-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/
[download-image]: https://img.shields.io/npm/dm/whistle.svg?style=flat-square
[download-url]: https://npmjs.org/package/whistle

whistle是用node实现的跨平台web调试代理工具，支持windows、mac、linux等操作系统，支持http、https、websocket请求，可以部署在本地电脑、虚拟机、或远程服务器，并通过本地浏览器访问whistle的配置页面，查看代理到whistle请求数据，及配置相应规则操作http[s]、ws[s]请求，包含如下功能：

- 简单的配置方式，把每个规则抽象成一个uri，并通过配置请求url到规则uri，实现对请求的操作
	1. 匹配方式 --> 操作规则

			pattern   operatorUri

	2. 如果pattern和operatorUri其中有一个不是http[s]、ws[s]协议，则两个的位置可以调换
		
			operatorUri pattern

- 灵活的匹配方式(**pattern**)，支持三种匹配方式：
	1. 域名匹配：把规则作用于所有该域名的请求
	2. 路径匹配：把规则作用于该路径或该路径的子路径
	3. 正则匹配：通过正则匹配规则，支持通过子匹配把请求url里面的参数带到新的url

- 丰富的操作规则：

	1. 配置host： 

			pattern ip
			#或
			ip pattern
	
			#组合方式
			ip pattern1 pattern2 ... patternN

	2. 修改请求： 请求方法、 请求头、延迟发送请求、限制请求速度，设置timeout

			pattern req://path 
			#或 
			req://path pattern
	
			#组合方式
			req://path pattern1 pattern2 ... patternN

	3. 修改响应： 响应状态码、响应头、 延迟响应、 限制响应速度

			pattern res://path 
			#或 
			res://path pattern
	
			#组合方式
			res://path pattern1 pattern2 ... patternN

	4. 请求替换： 
		
		1) 本地替换: 

			pattern [x]file://path1|path2... 
			#或 
			[x]file://path1|path2|...|pathN pattern

			#支持模板替换，主要用于替换jsonp请求
			pattern [x]tpl://path1|path2...
			#或
			[x]tpl://path1|path2|...|pathN pattern

			#组合方式
			[x]file://path1|path2|...|pathN pattern1 pattern2 ... patternN
			[x]tpl://path1|path2|...|pathN pattern1 pattern2 ... patternN

		2) 设置代理： 

			#设置http、https代理， host为ip或域名
			pattern proxy://host:port
			pattern proxy://username:password@host:port #需要用户名密码的情况
			pattern proxy://u1:p1|u2:p2|un|pn@host:port #同时带上多个用户名密码
			#或
			proxy://host:port pattern
			proxy://username:password@host:port pattern #需要用户名密码的情况
			proxy://u1:p1|u2:p2|un|pn@host:port pattern #同时带上多个用户名密码

			#设置socksv5代理
			pattern socks://host:port
			pattern socks://username:password@host:port  #需要用户名密码的情况
			#或 
			socks://host:port pattern
			socks://username:password@host:port pattern #需要用户名密码的情况

			#组合方式
			proxy://host:port pattern1 pattern2 ... patternN
			socks://host:port pattern1 pattern2 ... patternN

		3) url替换： 
			
			pattern [http[s]://]path
			#或
			[http[s]://]path pattern #pattern必须为正则表达式

			#不支持组合模式

		4) 自定义规则： 如果上述规则无法满足需求，还可以自定义规则，详见后面文档。

	5. 注入文本： 

		1) 注入到请求内容：
			
			#在替换请求内容
			pattern body://path
			pattern body://path1|path2|...|pathN
			#或
			body://path1|path2|...|pathN pattern

			#在请求内容前面注入文本
			pattern 
			pattern prepend://path1|path2|...|pathN
			#或
			prepend://path1|path2|...|pathN pattern

			#在请求内容底部注入文本
			pattern append://path1|path2|...|pathN
			#或
			append://path1|path2|...|pathN pattern

			#组合模式
			append://path pattern1 pattern2 ... patternN
			append://path1|path2|...|pathN pattern1 pattern2 ... patternN

		2) 注入到响应内容：
			
			#在替换响应内容，这与本地替换的区别是：body是修改了响应后的内容，而本地替换是直接把请求替换成本地。
			pattern body://path
			pattern body://path1|path2|...|pathN
			#或
			body://path1|path2|...|pathN pattern

			#在响应内容前面注入文本
			pattern 
			pattern prepend://path1|path2|...|pathN
			#或
			prepend://path1|path2|...|pathN pattern

			#在响应内容底部注入文本
			pattern append://path1|path2|...|pathN
			#或
			append://path1|path2|...|pathN pattern

			#组合模式
			append://path pattern1 pattern2 ... patternN
			append://path1|path2|...|pathN pattern1 pattern2 ... patternN
		

	6. 内置weinre： 利用pc浏览器调试手机页面

			# `weinreId` 表示任意一个id，主要用于把请求按类型分组，方便调试
			pattern weinre://weinreId 
			#或
			weinre://weinreId pattern

			#组合模式
			weinre://weinreId pattern1 pattern2 ... patternN
			

	7. 设置过滤： 拦截https请求、隐藏抓包数据、禁用上述各种协议

		1) 拦截https请求：只有配置该过滤器，https及websocket的抓包，替换功能才能启用

			pattern filter://https
			#或
			filter://https pattern

			#组合模式
			filter://https pattern1 pattern2 ... patternN

		2) 隐藏抓包数据：某些请求的数据不想在抓包列表展示出来，以免影响查看其它请求
		
			pattern filter://hide
			#或
			filter://hide pattern

			#组合模式
			filter://hide pattern1 pattern2 ... patternN

		3) 禁用规则配置：可以把配置页面配置的各种规则禁用掉，包括：host、req、res、rule、prepend、body、append、weinre等，下面用 `rule` 代替上述名称

			pattern filter://rule
			#或
			filter://rule pattern

			#组合模式
			filter://rule pattern1 pattern2 ... patternN

		4) 组合功能：
			
			pattern filter://https|hide|host|req|res|rule|prepend|body|append|weinre 
			#或
			filter://https|hide|host|req|res|rule|prepend|body|append|weinre pattern

			#组合模式
			filter://https|hide|host|req|res|rule|prepend|body|append|weinre pattern1 pattern2 ... patternN



	*Note: `[]` 表示可选*，前面带 `x` 的协议(如：`xfile`)，表示如果本地请求不到，会直接请求线上， 路径组合 `path1|...|pathN` 表示whistle会顺序在这些文件或目录里面找，找到为止。*

- 友好的配置页面，支持配置分组，高亮显示，可以把规则内容配置的ui的values系统里面，无需用本地文件承载，查看请求信息，重发请求，构造请求:

	1. 配置页面：
		
		图1

	2. 请求列表：

		图2

下面先讲下如何安装启动whistle，然后再对上面的各种功能给出一些例子。


有什么问题可以通过QQ群反馈： 462558941
	


